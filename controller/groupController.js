const Group = require("../model/group");
const User = require("../model/credential");
const cloudinary = require("../config/cloudinary");  
const mongoose = require("mongoose");
const logActivity = require("../config/logger.js");
const { encrypt ,decrypt} = require("../middleware/encryption.js");

const sendGroupMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { text } = req.body;
    const senderId = req.user._id;

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      return res.status(400).json({ error: "Invalid sender ID" });
    }

    // Check for empty message (no text)
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Cannot send empty message" });
    }

    // Validate text length and type
    if (typeof text !== "string" || text.length > 1000) {
      return res.status(400).json({ error: "Invalid message text" });
    }

    // Find the group
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Check if sender is a group member
    if (!group.members.some(memberId => memberId.toString() === senderId.toString())) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Encrypt the message text
    const encryptedText = encrypt(text.trim());

    // Create new message object with encrypted text
    const newMessage = {
      senderId,
      text: encryptedText,
      createdAt: new Date(),
    };

    // Add message and save group
    group.messages.push(newMessage);
    await group.save();

    // Populate sender details in messages (for response)
    await group.populate('messages.senderId', 'fullName profilePic');

    // Get the newly added message (last in array)
    const savedMessage = group.messages[group.messages.length - 1].toObject();

    // Decrypt text before sending response
    savedMessage.text = decrypt(savedMessage.text);

    // Log the action
    await logActivity({
      userId: senderId,
      action: "send_group_message",
      details: {
        groupId,
        message: {
          hasText: true,
        },
      },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Send response with decrypted message
    res.status(201).json({
      message: "Message sent",
      newMessage: savedMessage,
    });
  } catch (error) {
    console.error("sendGroupMessage error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const createGroup = async (req, res) => {
  try {
    const { groupName, members, profilePic } = req.body;
    const userId = req.user?._id;

    if (!groupName || !members || !Array.isArray(members) || members.length < 1) {
      return res.status(400).json({ message: "Group name and at least 2 members are required" });
    }

    // Validate groupName
    if (typeof groupName !== 'string' || groupName.trim().length === 0 || groupName.length > 100) {
      return res.status(400).json({ message: "Invalid group name" });
    }

    // Validate members: ensure all are valid ObjectId and exist in DB
    const validMemberIds = members.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validMemberIds.length !== members.length) {
      return res.status(400).json({ message: "Invalid member IDs in list" });
    }

    const usersExist = await User.find({ _id: { $in: validMemberIds } }).countDocuments();
    if (usersExist !== validMemberIds.length) {
      return res.status(400).json({ message: "One or more members do not exist" });
    }

    // Ensure userId not duplicated in members array
    const uniqueMembers = Array.from(new Set([userId.toString(), ...validMemberIds]));

    const newGroup = new Group({
      name: groupName.trim(),
      profilePic: profilePic || "",
      members: uniqueMembers,
      createdBy: userId,
      admin: userId,
    });

    await newGroup.save();

    await logActivity({
      userId,
      action: "create_group",
      details: { groupId: newGroup._id, groupName },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({ message: "Group created successfully", group: newGroup });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


const getGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find groups where user is a member
    const groups = await Group.find({ members: userId })
      .populate("members", "fullName profilePic")
      .populate("admin", "fullName profilePic")
      .populate({
        path: "messages.senderId",
        select: "fullName profilePic",
      })
      .select("name profilePic messages members createdAt")
      .lean();

    const formattedGroups = groups.map((group) => {
      const latestMessage = group.messages.length > 0 ? group.messages[group.messages.length - 1] : null;

      return {
        ...group,
        latestMessage: latestMessage && latestMessage.senderId
          ? {
              text: decrypt(latestMessage.text) || null,
              type: "text",
              sender: latestMessage.senderId.fullName || "Unknown",
            }
          : null,
        groupCreatedAt: group.createdAt,
        messages: undefined, // exclude messages array from response for efficiency
      };
    });

    res.status(200).json(formattedGroups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ message: "Error fetching groups" });
  }
};





const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id; // Assumes auth middleware sets req.user

    // Find group and populate sender info for messages
    const group = await Group.findById(groupId)
      .populate("messages.senderId", "fullName profilePic")
      .select("messages profilePic name members");

    if (!group) return res.status(404).json({ error: "Group not found" });

    // Check if the requesting user is a member of the group
    if (!group.members.some(memberId => memberId.toString() === userId.toString())) {
      return res.status(403).json({ error: "Access denied. You are not a member of this group." });
    }

    // Decrypt messages text before sending
    const decryptedMessages = group.messages.map((msg) => {
      const msgObj = msg.toObject();
      msgObj.text = decrypt(msgObj.text);
      return msgObj;
    });

    res.status(200).json({
      messages: decryptedMessages,
      profilePic: group.profilePic,
      groupName: group.name,
    });
  } catch (error) {
    console.error("Error getting group messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


const addUserToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const loggedInUserId = req.user._id;

    // Validate userId format
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid or missing user ID" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Find group
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Check if logged-in user is a member of the group
    const isMember = group.members.some(member =>
      member.toString() === loggedInUserId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: "You must be a group member to add users" });
    }

    // Check if target user exists
    const user = await User.findById(userObjectId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Prevent duplicate
    if (group.members.some(member => member.toString() === userObjectId.toString())) {
      return res.status(400).json({ error: "User is already in the group" });
    }

    // Add user
    group.members.push(userObjectId);
    await group.save();

    // Log activity
    await logActivity({
      userId: loggedInUserId,
      action: "add_user_to_group",
      details: {
        groupId,
        addedUserId: userId,
      },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(200).json({ message: "User added to group", group });
  } catch (error) {
    console.error("Error adding user to group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Find the group
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Ensure user is part of the group
    const isMember = group.members.includes(userId.toString());
    if (!isMember) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Remove the user from members
    group.members = group.members.filter(
      (memberId) => memberId.toString() !== userId.toString()
    );

    // If no members left, delete the group
    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);

      await logActivity({
        userId,
        action: "delete_group_no_members",
        details: { groupId },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.status(200).json({ message: "Group deleted as it had no members left" });
    }
    // Save updated group
    await group.save();

    await logActivity({
      userId,
      action: "left_group",
      details: { groupId },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(200).json({ message: "Successfully left the group" });
  } catch (error) {
    console.error("Error leaving the group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};



const updateGroupProfilePic = async (req, res) => {
  try {
    const { profilePic } = req.body; 
    const groupId = req.params.groupId;
    const userId = req.user._id; 

    if (!profilePic) {
      return res.status(400).json({ message: "Profile pic is required" });
    }

    // Extract MIME type using RegEx
    const matches = profilePic.match(/^data:(image\/[a-zA-Z]+);base64,/);
    if (!matches || matches.length !== 2) {
      return res.status(400).json({ message: "Invalid image format." });
    }

    const mimeType = matches[1];
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowedMimeTypes.includes(mimeType)) {
      return res.status(400).json({ message: "Only JPG, PNG, or WEBP images are allowed." });
    }

    // Get the group from DB
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Ensure user is in the group or is the group admin
    const isMember = group.members.some(
      (memberId) => memberId.toString() === userId.toString()
    );
    const isAdmin = group.admin && group.admin.toString() === userId.toString();

    if (!isMember && !isAdmin) {
      return res.status(403).json({ message: "You are not authorized to update this group." });
    }

    // Upload to Cloudinary
    // console.log("Uploading image to Cloudinary...");
    const uploadResponse = await cloudinary.uploader.upload(profilePic, {
      folder: "group_pics",
    });
    // console.log("Upload response:", uploadResponse);

    // Update group image
    group.profilePic = uploadResponse.secure_url;
    await group.save();

    res.status(200).json(group);
  } catch (error) {
    console.error("Error updating group profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



const updateGroupName = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName } = req.body;
    const userId = req.user._id; 

    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ message: "New group name is required" });
    }

    // Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Optional: Check if user is part of the group
    if (!group.members.includes(userId)) {
      return res.status(403).json({ error: "You are not authorized to update this group" });
    }

    group.name = groupName.trim();
    await group.save();

    res.status(200).json({ message: "Group name updated successfully", group });
  } catch (error) {
    console.error("Error updating group name:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



module.exports = {
  createGroup,
  getGroups,
  sendGroupMessage,
  getGroupMessages,
  addUserToGroup,
  leaveGroup,
  updateGroupProfilePic,
  updateGroupName, 
};
