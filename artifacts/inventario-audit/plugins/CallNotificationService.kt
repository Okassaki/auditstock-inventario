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
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.io.File

class CallNotificationService : FirebaseMessagingService() {

    companion object {
        const val NOTIF_ID    = 9001
        const val CHANNEL_ID  = "llamadas"
        const val ACTION_REJECT = "com.auditstock.inventario.REJECT_CALL"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        if (remoteMessage.data["type"] == "call_offer") {
            showFullScreenCallNotification(remoteMessage.data)
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
    }

    /**
     * Lee el valor "callSound" del archivo native_config.json.
     * Retorna "ring1", "ring2", "ring3", "silent", o una URI de sistema/custom.
     */
    private fun readCallSound(): String {
        return try {
            val file = File(filesDir, "native_config.json")
            if (file.exists()) JSONObject(file.readText()).optString("callSound", "ring1")
            else "ring1"
        } catch (_: Exception) { "ring1" }
    }

    /**
     * Convierte el callSound en una Uri de Android para el canal de notificación.
     * Retorna null si el tono es "silent".
     */
    private fun callSoundToUri(callSound: String): Uri? {
        return when (callSound) {
            "silent" -> null
            "ring2"  -> Uri.parse("android.resource://$packageName/raw/ring2")
            "ring3"  -> Uri.parse("android.resource://$packageName/raw/ring3")
            "ring1"  -> Uri.parse("android.resource://$packageName/raw/ring1")
            else     -> runCatching { Uri.parse(callSound) }.getOrNull()
                ?: Uri.parse("android.resource://$packageName/raw/ring1")
        }
    }

    /**
     * Asegura que el canal "llamadas" exista con el sonido correcto.
     * Si el canal existe pero tiene un sonido diferente al guardado, lo elimina y recrea.
     */
    private fun ensureCallChannel(notifManager: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val callSound   = readCallSound()
        val desiredUri  = callSoundToUri(callSound)
        val desiredStr  = desiredUri?.toString()

        val existing   = notifManager.getNotificationChannel(CHANNEL_ID)
        val currentStr = existing?.sound?.toString()

        if (existing != null && currentStr == desiredStr) return

        // Eliminar si existe con sonido diferente
        if (existing != null) {
            notifManager.deleteNotificationChannel(CHANNEL_ID)
        }

        val audioAttr = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val ch = NotificationChannel(CHANNEL_ID, "Llamadas", NotificationManager.IMPORTANCE_HIGH)
        ch.setSound(desiredUri, audioAttr)
        ch.enableVibration(true)
        ch.vibrationPattern = longArrayOf(0, 500, 250, 500)
        ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        notifManager.createNotificationChannel(ch)
    }

    private fun showFullScreenCallNotification(msgData: Map<String, String>) {
        val caller   = msgData["caller"]   ?: msgData["fromName"] ?: "Alguien"
        val fromName = msgData["fromName"] ?: caller
        val callType = msgData["callType"] ?: "audio"
        val offerId  = msgData["offerId"]  ?: ""
        val roomId   = msgData["roomId"]   ?: ""
        val isVideo  = callType == "video"

        val notifManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ensureCallChannel(notifManager)

        val pFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        val launchBase = packageManager.getLaunchIntentForPackage(packageName) ?: return
        launchBase.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        launchBase.putExtra("notifType",   "call_offer")
        launchBase.putExtra("notifAction", "accept")
        launchBase.putExtra("caller",      caller)
        launchBase.putExtra("fromName",    fromName)
        launchBase.putExtra("callType",    callType)
        launchBase.putExtra("offerId",     offerId)
        launchBase.putExtra("roomId",      roomId)
        for ((k, v) in msgData) { launchBase.putExtra(k, v) }

        val acceptPI     = PendingIntent.getActivity(this, 0, launchBase, pFlags)
        val fullScreenPI = PendingIntent.getActivity(this, 1, launchBase, pFlags)

        val rejectIntent = Intent(ACTION_REJECT)
        rejectIntent.setClass(this, CallRejectReceiver::class.java)
        rejectIntent.putExtra("offerId", offerId)
        val rejectPI = PendingIntent.getBroadcast(this, 2, rejectIntent, pFlags)

        val iconRes = resources.getIdentifier("ic_launcher", "mipmap", packageName)
            .let { if (it != 0) it else android.R.drawable.ic_menu_call }

        val callerPerson = Person.Builder().setName(fromName).setImportant(true).build()

        val title = if (isVideo) "📹 Videollamada de $fromName" else "📞 Llamada de $fromName"
        val body  = if (isVideo) "Toca para responder la videollamada" else "Toca para responder"

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(iconRes)
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
                NotificationCompat.CallStyle
                    .forIncomingCall(callerPerson, rejectPI, acceptPI)
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
