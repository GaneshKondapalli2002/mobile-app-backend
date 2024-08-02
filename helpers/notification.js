const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (already initialized in server.js)
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

const sendNotification = async (title, body, fcmTokens) => {
  try {
    const message = {
      notification: {
        title: title,
        body: body,
      },
      tokens: fcmTokens,
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log('Successfully sent notification:', response);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

module.exports = sendNotification;
