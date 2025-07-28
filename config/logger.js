
const ActivityLog = require("../model/activityLog");

async function logActivity({ userId, action, details = {}, ip, userAgent }) {
  try {
    const log = new ActivityLog({ userId, action, details, ip, userAgent });
    await log.save();
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}

module.exports = logActivity;
