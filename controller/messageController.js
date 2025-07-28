const User1 = require("../model/credential.js");
const Message = require("../model/message.js");
const cloudinary = require("../config/cloudinary.js");
const { getReceiverSocketId, io } = require("../config/socket.js");

const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // Get users excluding the logged-in user
    const filteredUsers = await User1.find({ _id: { $ne: loggedInUserId } }).select("-password");

    // Fetch the latest message for each user, excluding deleted messages
    const usersWithLatestMessage = await Promise.all(
      filteredUsers.map(async (user) => {
        const latestMessage = await Message.findOne({
          $or: [
            { senderId: loggedInUserId, receiverId: user._id },
            { senderId: user._id, receiverId: loggedInUserId },
          ],
          deletedBy: { $ne: loggedInUserId }, 
        })
          .sort({ createdAt: -1 }) // Sort by most recent
          .limit(1);

        let latestMessageText = "No messages yet";
        let isUnread = false; // Track unread status

        if (latestMessage) {
          if (latestMessage.text) {
            latestMessageText = latestMessage.text;
          } else if (latestMessage.image) {
            latestMessageText = "📷 Photo";
          } else if (latestMessage.audio) {
            latestMessageText = "🎵 Audio";
          } else if (latestMessage.document) {
            latestMessageText = "📄 Document";
          }
          if (
            latestMessage.receiverId.toString() === loggedInUserId.toString() &&
            !latestMessage.isSeen
          ) {
            isUnread = true;
          }
        }

        return {
          ...user.toObject(),
          latestMessage: latestMessage ? latestMessageText : "No messages ", 
          lastMessageTime: latestMessage ? latestMessage.createdAt : null,
          isUnread, 
        };
      })
    );

    usersWithLatestMessage.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

    

    res.status(200).json(usersWithLatestMessage);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


const markMessagesAsSeen = async (req, res) => {
  try {
    const { senderId } = req.body; // Sender whose messages should be marked as read
    const receiverId = req.user._id; // The logged-in user (recipient)

    await Message.updateMany(
      { senderId, receiverId, isSeen: false },
      { $set: { isSeen: true } }
    );

    res.status(200).json({ success: true, message: "Messages marked as seen" });
  } catch (error) {
    console.error("Error marking messages as seen:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const markMessagesAsUnread = async (req, res) => {
  try {
    const { userId } = req.params;
    const loggedInUserId = req.user._id; // Get the logged-in user

    // Update messages from the selected user, marking them as unseen
    await Message.updateMany(
      { senderId: userId, receiverId: loggedInUserId, isSeen: true },
      { $set: { isSeen: false } }
    );

    res.status(200).json({ message: "Messages marked as unread" });
  } catch (error) {
    console.error("Error marking messages as unread:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all messages between logged-in user and the user to chat with
const getMessages = async (req, res) => {
  try {
    const { id: chatPartnerId } = req.params;
    // const {  chatPartnerId } = req.params.id;
    const loggedInUserId = req.user._id; 

    const messages = await Message.find({
      $or: [
        { senderId: loggedInUserId, receiverId: chatPartnerId },
        { senderId: chatPartnerId, receiverId: loggedInUserId }
      ],
      deletedBy: { $ne: loggedInUserId } //  Exclude messages deleted by this user
    }).sort({ createdAt: 1 });

    res.status(200).json(messages || []);
  } catch (error) {
    console.error("Error in getMessages:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


const mongoose = require("mongoose");


const sendMessage = async (req, res) => {
  try {
    const { text, image, audio, document, documentName } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    //  Validate receiver ID
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ error: "Invalid receiver ID." });
    }

    //  Validate message text
    if (text && (typeof text !== "string" || text.length > 1000)) {
      return res.status(400).json({ error: "Invalid message text." });
    }


    // Reject empty message (no text, no image, no audio, no document)
if (
  (!text || text.trim() === "") &&
  !image &&
  !audio &&
  !document
) {
  return res.status(400).json({ error: "Cannot send empty message." });
}

    //  Check if receiver exists and has blocked the sender
    const receiver = await User1.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found." });
    }

    if (receiver.blockedUsers.includes(senderId)) {
      return res.status(403).json({ error: "You have been blocked by this user." });
    }

    //  File upload handlers
    let imageUrl = "", audioUrl = "", documentUrl = "";
    //  Validate & Upload Image
    if (image && typeof image === "string") {
      if (!image.startsWith("data:image/")) {
        return res.status(400).json({ error: "Invalid image format." });
      }
      const uploadResponse = await cloudinary.uploader.upload(image, {
        resource_type: "image",
      });
      imageUrl = uploadResponse.secure_url;
    }

    //  Validate & Upload Audio
    if (audio && typeof audio === "string") {
      if (!audio.startsWith("data:audio/")) {
        return res.status(400).json({ error: "Invalid audio format." });
      }
      const uploadResponse = await cloudinary.uploader.upload(audio, {
        resource_type: "auto",
      });
      audioUrl = uploadResponse.secure_url;
    }

    //  Validate & Upload Document
    if (document && typeof document === "string") {
      if (!document.startsWith("data:application/") && !document.startsWith("data:text/")) {
        return res.status(400).json({ error: "Invalid document format." });
      }
      const publicId = `documents/${Date.now()}-${(documentName || "file").split(".")[0]}`;
      const uploadResponse = await cloudinary.uploader.upload(document, {
        resource_type: "raw",
        public_id: publicId,
        use_filename: true,
        unique_filename: false,
      });
      documentUrl = uploadResponse.secure_url;
    }

    //  Save the message
    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl || null,
      audio: audioUrl || null,
      document: documentUrl || null,
      documentName: documentName || null,
    });

    await newMessage.save();
    console.log("Message sent:", newMessage);

    //  Emit via WebSocket (if user is online)
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    // Success response
    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: newMessage,
    });

  } catch (error) {
    console.error("Error in sendMessage:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};




//In places like deleteChat, ensure users can't delete others' conversations
const deleteChat = async (req, res) => {
  try {
    const { id: userToDelete } = req.params;
    const loggedInUserId = req.user._id;

    if (loggedInUserId.toString() !== req.user._id.toString()) {
  return res.status(403).json({ error: "Unauthorized" });
}


    // Soft delete: Add user ID to `deletedBy`
    await Message.updateMany(
      {
        $or: [
          { senderId: loggedInUserId, receiverId: userToDelete },
          { senderId: userToDelete, receiverId: loggedInUserId }
        ]
      },
      { $addToSet: { deletedBy: loggedInUserId } } //  Track deleted messages
    );

    res.status(200).json({ message: "Chat deleted successfully" });
  } catch (error) {
    console.error("Error in deleteChat:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const blockUser = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const loggedInUserId = req.user._id;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Prevent blocking self
    if (userId === loggedInUserId.toString()) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    // Check if target user exists
    const targetUser = await User1.findById(userId).select("_id");
    if (!targetUser) {
      return res.status(404).json({ message: "User to block not found" });
    }

    // Add to blockedUsers set, avoid duplicates
    const updatedUser = await User1.findByIdAndUpdate(
      loggedInUserId,
      { $addToSet: { blockedUsers: userId } },
      { new: true }
    ).populate("blockedUsers", "fullName _id profilePic");

    res.status(200).json({ blockedUsers: updatedUser.blockedUsers });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ message: "Failed to block user" });
  }
};

const unblockUser = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const loggedInUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (userId === loggedInUserId.toString()) {
      return res.status(400).json({ message: "You cannot unblock yourself" });
    }

    const targetUser = await User1.findById(userId).select("_id fullName profilePic");
    if (!targetUser) {
      return res.status(404).json({ message: "User to unblock not found" });
    }

    // Remove from blockedUsers array
    const updatedUser = await User1.findByIdAndUpdate(
      loggedInUserId,
      { $pull: { blockedUsers: userId } },
      { new: true }
    ).populate("blockedUsers", "fullName _id profilePic");

    res.status(200).json({
      blockedUsers: updatedUser.blockedUsers,
      unblockedUser: targetUser,
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ message: "Failed to unblock user" });
  }
};

const getBlockedUsers = async (req, res) => {
  try {
    const loggedInUser = await User1.findById(req.user._id).populate("blockedUsers", "fullName _id profilePic");
    if (!loggedInUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ blockedUsers: loggedInUser.blockedUsers });
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    res.status(500).json({ message: "Failed to fetch blocked users" });
  }
};

module.exports = {
  getUsersForSidebar,
  getMessages,
  sendMessage,
  deleteChat, 
  blockUser, 
  unblockUser,
  getBlockedUsers  ,
  markMessagesAsSeen,
  markMessagesAsUnread
};
