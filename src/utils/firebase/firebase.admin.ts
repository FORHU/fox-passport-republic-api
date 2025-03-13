import firebaseAdmin from "firebase-admin";
import { FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_PROJECT_ID } from "../../config";
import { metaDataKey, NotificationStatusType, NotificationType, TNotications } from "../../models/notification.model";
import { ObjectId } from "mongodb";
import NotificationSvc from "../../services/notification.service";

export function initializeFirebaseAdmin() {
  if (!firebaseAdmin.apps.length) {
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
  return firebaseAdmin;
}

type notification = {
  title: string;
  body: string;
};

type DataPayload = {
  type: NotificationType;
} & {
  [key: string]: string;
};

type android = {
  notification: {
    sound: string;
  };
};

type apns = {
  payload: {
    aps: {
      sound: string;
    };
  };
};

type NotificationParticipants = {
  senderId: ObjectId;
  receiverId: ObjectId;
  userId: string;
};

type NotificationMetadata = {
  key: metaDataKey;
  value: string;
};

export const pushNotification = async (
  notification: notification,
  data: DataPayload,
  android: android,
  apns: apns,
  participants: NotificationParticipants,
  metadata: NotificationMetadata,
) => {
  try {
    const firebaseAdmin = initializeFirebaseAdmin();

    const pushNotification = {
      notification,
      data,
      android,
      apns,
      topic: participants.userId,
    };

    const notificationData: TNotications = {
      sender: participants.senderId,
      receiver: participants.receiverId,
      metadata: { [metadata.key]: metadata.value },
      title: notification.title,
      body: notification.body,
      status: NotificationStatusType.UNREAD,
    };

    await Promise.all([NotificationSvc.createNotification(notificationData), firebaseAdmin.messaging().send(pushNotification)]);
  } catch (error) {
    console.log(error);
    throw new Error(error);
  }
};
