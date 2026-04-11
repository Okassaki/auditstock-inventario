package com.auditstock.inventario

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class CallNotificationService : ExpoFirebaseMessagingService() {

    companion object {
        const val NOTIF_ID = 9001
        const val CHANNEL_ID = "llamadas"
        const val ACTION_REJECT = "com.auditstock.inventario.REJECT_CALL"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val type = remoteMessage.data["type"]
        if (type == "call_offer") {
            showFullScreenCallNotification(remoteMessage)
        } else {
            super.onMessageReceived(remoteMessage)
        }
    }

    private fun showFullScreenCallNotification(message: RemoteMessage) {
        val data     = message.data
        val caller   = data["caller"]   ?: data["fromName"] ?: "Alguien"
        val fromName = data["fromName"] ?: caller
        val callType = data["callType"] ?: "audio"
        val offerId  = data["offerId"]  ?: ""
        val roomId   = data["roomId"]   ?: ""

        val notifManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val existing = notifManager.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                val soundUri = Uri.parse(
                    "android.resource://$packageName/raw/ring1"
                )
                val audioAttr = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                val ch = NotificationChannel(CHANNEL_ID, "Llamadas", NotificationManager.IMPORTANCE_HIGH).apply {
                    setSound(soundUri, audioAttr)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 250, 500)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                notifManager.createNotificationChannel(ch)
            }
        }

        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        val acceptIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("notifType", "call_offer")
            putExtra("notifAction", "accept")
            putExtra("caller",   caller)
            putExtra("fromName", fromName)
            putExtra("callType", callType)
            putExtra("offerId",  offerId)
            putExtra("roomId",   roomId)
            data.forEach { (k, v) -> putExtra(k, v) }
        } ?: return

        val acceptPI    = PendingIntent.getActivity(this, 0, acceptIntent, pendingFlags)
        val fullScreenPI = PendingIntent.getActivity(this, 1, acceptIntent, pendingFlags)

        val rejectIntent = Intent(ACTION_REJECT).apply {
            setClass(this@CallNotificationService, CallRejectReceiver::class.java)
            putExtra("offerId", offerId)
        }
        val rejectPI = PendingIntent.getBroadcast(this, 2, rejectIntent, pendingFlags)

        val iconResId = resources.getIdentifier("ic_launcher", "mipmap", packageName)
            .takeIf { it != 0 } ?: android.R.drawable.ic_menu_call

        val callerPerson = Person.Builder()
            .setName(fromName)
            .setImportant(true)
            .build()

        val isVideo = callType == "video"
        val title   = if (isVideo) "📹 Videollamada de $fromName" else "📞 Llamada de $fromName"
        val body    = if (isVideo) "Toca para responder la videollamada" else "Toca para responder"

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(iconResId)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(acceptPI)
            .setFullScreenIntent(fullScreenPI, true)
            .setAutoCancel(true)
            .setOngoing(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setStyle(
                NotificationCompat.CallStyle.forIncomingCall(callerPerson, rejectPI, acceptPI)
                    .setIsVideo(isVideo)
            )
        } else {
            builder
                .addAction(android.R.drawable.ic_menu_call, "Responder", acceptPI)
                .addAction(android.R.drawable.ic_delete,    "Rechazar",  rejectPI)
        }

        notifManager.notify(NOTIF_ID, builder.build())
    }
}
