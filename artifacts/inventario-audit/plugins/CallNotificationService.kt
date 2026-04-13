package com.auditstock.inventario

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.io.File

class CallNotificationService : FirebaseMessagingService() {

    companion object {
        const val NOTIF_ID      = 9001
        const val CHANNEL_ID    = "llamadas_v2"
        const val ACTION_REJECT = "com.auditstock.inventario.REJECT_CALL"
        private const val WAKE_TAG = "AuditStock:CallWake"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        if (remoteMessage.data["type"] == "call_offer") {
            showFullScreenCallNotification(remoteMessage.data)
        } else {
            // Pasar mensajes normales (chat, updates, etc.) al handler de Expo
            super.onMessageReceived(remoteMessage)
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
    }

    private fun readCallSound(): String {
        return try {
            val file = File(filesDir, "native_config.json")
            if (file.exists()) JSONObject(file.readText()).optString("callSound", "ring1")
            else "ring1"
        } catch (_: Exception) { "ring1" }
    }

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
     * Siempre borra y recrea el canal con USAGE_NOTIFICATION_RINGTONE.
     * El canal "llamadas_v2" es un ID nuevo — Android no tiene historial
     * de ajustes guardados para él, así que usa exactamente lo que especificamos.
     */
    private fun recreateCallChannel(notifManager: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val callSound = readCallSound()
        val soundUri  = callSoundToUri(callSound)

        // Limpiar canal viejo si existe
        notifManager.deleteNotificationChannel("llamadas")
        notifManager.deleteNotificationChannel(CHANNEL_ID)

        val audioAttr = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val ch = NotificationChannel(CHANNEL_ID, "Llamadas", NotificationManager.IMPORTANCE_HIGH)
        ch.setSound(soundUri, audioAttr)
        ch.enableVibration(true)
        ch.vibrationPattern = longArrayOf(0, 500, 250, 500, 250, 500)
        ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        notifManager.createNotificationChannel(ch)
    }

    /**
     * Detecta si la app está en primer plano (usuario la está usando activamente).
     * En ese caso, el overlay JS ya muestra la pantalla de llamada y maneja el audio.
     * La notificación se muestra de forma silenciosa (sin sonido/vibración) para
     * no interferir con el ringtone del overlay.
     */
    private fun isAppInForeground(): Boolean {
        return try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val procs = am.runningAppProcesses ?: return false
            procs.any { it.processName == packageName &&
                it.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND }
        } catch (_: Exception) { false }
    }

    @Suppress("DEPRECATION")
    private fun acquireWakeLock(): PowerManager.WakeLock? {
        return try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val wl = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK
                    or PowerManager.ACQUIRE_CAUSES_WAKEUP
                    or PowerManager.ON_AFTER_RELEASE,
                WAKE_TAG
            )
            wl.acquire(30_000L)
            wl
        } catch (_: Exception) { null }
    }

    private fun showFullScreenCallNotification(msgData: Map<String, String>) {
        val caller   = msgData["caller"]   ?: msgData["fromName"] ?: "Alguien"
        val fromName = msgData["fromName"] ?: caller
        val callType = msgData["callType"] ?: "audio"
        val offerId  = msgData["offerId"]  ?: ""
        val roomId   = msgData["roomId"]   ?: ""
        val isVideo  = callType == "video"
        val inForeground = isAppInForeground()

        // Si la app está en primer plano, el overlay JS maneja la llamada completamente:
        // muestra la pantalla y toca el ringtone configurado por el usuario.
        // No mostrar notificación nativa → evita que Android reproduzca cualquier
        // sonido del sistema que interfiera (setSilent(true) es ignorado en CATEGORY_CALL).
        if (inForeground) return

        val notifManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Siempre recrear el canal con RINGTONE correcto
        recreateCallChannel(notifManager)

        // Despertar pantalla si la app está en background/cerrada
        val wakeLock = acquireWakeLock()

        val pFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        val launchBase = packageManager.getLaunchIntentForPackage(packageName) ?: run {
            wakeLock?.release()
            return
        }
        launchBase.flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                           Intent.FLAG_ACTIVITY_CLEAR_TOP or
                           Intent.FLAG_ACTIVITY_SINGLE_TOP
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
            .setAutoCancel(false)
            .setOngoing(true)
            .setTimeoutAfter(60_000L)

        // Si la app está en primer plano: silenciar la notificación del sistema.
        // El overlay JS ya muestra la pantalla y reproduce el ringtone configurado.
        if (inForeground) {
            builder.setSilent(true)
        }

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
        wakeLock?.release()
    }
}
