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

    if (!groupName || !members || members.length < 2) {
      return res.status(400).json({ message: "Group name and at least 2 members are required" });
    }

    const newGroup = new Group({
      name: groupName,
      profilePic: profilePic || "",
      members: [userId, ...members],
      createdBy: userId,
      admin: userId, 
      
    });

    await newGroup.save();
     await logActivity({
      userId: userId,
      action: "create_group",
      details: { groupId: newGroup._id, groupName: groupName },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  

    res.status(201).json({ message: "Group created successfully", group: newGroup });
  } catch (error) {
    console.error(" Error creating group:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};
const getGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    const groups = await Group.find({ members: userId })
      .populate("members", "fullName profilePic")
      .populate("admin", "fullName profilePic")
      .populate({
        path: "messages.senderId",
        select: "fullName profilePic",
      })
      .select("name profilePic messages members createdAt")
      .lean();

    // Decrypt latest message text
    const formattedGroups = groups.map((group) => {
      const latestMessage = group.messages.length > 0 ? group.messages[group.messages.length - 1] : null;

      return {
        ...group,
        latestMessage: latestMessage
          ? {
              text: decrypt(latestMessage.text) || null,
              type: "text",
              sender: latestMessage.senderId.fullName,
            }
          : null,
        groupCreatedAt: group.createdAt,
      };
    });

    res.status(200).json(formattedGroups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ message: "Error fetching groups", error });
  }
};




const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId)
      .populate("messages.senderId", "fullName profilePic")
      .select("messages profilePic name");

    if (!group) return res.status(404).json({ error: "Group not found" });

    // Decrypt all messages before sending
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
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const addUserToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    console.log("User ID from request:", userId);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid or missing user ID" });
    }

    // Convert userId to ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Find group by ID
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

 
    // Check if user exists in the user database
    const user = await User.findById(userObjectId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Check if user is already in the group
    if (group.members.some(member => member.toString() === userObjectId.toString())) {
      return res.status(400).json({ error: "User is already in the group" });
    }

    // Add user to the group
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
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Find the group by ID
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Remove user from the group members
    group.members = group.members.filter(member => member.toString() !== userId.toString());

    // If there are no members left, delete the group
    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);
      return res.status(200).json({ message: "Group deleted as it had no members left" });
    } else {
      // Save the group if there are still members
      await group.save();
    }


    await logActivity({
        userId,
        action: "delete_group_no_members",
        details: { groupId },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

    res.status(200).json({ message: "Successfully left the group" });
  } catch (error) {
    console.error("Error leaving the group:", error); // Log the error for debugging
    res.status(500).json({ error: "Internal server error" });
  }
};


const updateGroupProfilePic = async (req, res) => {
  try {
    const { profilePic } = req.body; // Expect Base64 string
    const groupId = req.params.groupId;

    if (!profilePic) {
      return res.status(400).json({ message: "Profile pic is required" });
    }

    // Log to check incoming data
    console.log("Received profilePic (Base64 string):", profilePic.slice(0, 100)); // Log first 100 characters

    // Upload image to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(profilePic, {
      folder: "group_pics", // Optional folder
    });

    console.log("Cloudinary upload response:", uploadResponse);

    // Update the group profile in the database with Cloudinary's URL
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { profilePic: uploadResponse.secure_url },
      { new: true }
    );

    res.status(200).json(updatedGroup); // Respond with updated group
  } catch (error) {
    console.log("Error in update group profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateGroupName = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName } = req.body;

    if (!groupName) {
      return res.status(400).json({ message: "New group name is required" });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    group.name = groupName; 
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
