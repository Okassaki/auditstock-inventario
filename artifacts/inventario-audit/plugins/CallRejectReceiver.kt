package com.auditstock.inventario

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.File
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class CallRejectReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val offerId = intent.getStringExtra("offerId") ?: return

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(CallNotificationService.NOTIF_ID)

        val apiUrl = readApiUrl(context) ?: return

        Thread {
            try {
                val conn = URL("$apiUrl/calls/respond").openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 8_000
                conn.readTimeout = 8_000
                val body = JSONObject().apply {
                    put("offerId", offerId)
                    put("response", "rejected")
                }.toString()
                OutputStreamWriter(conn.outputStream).use { it.write(body) }
                conn.responseCode
                conn.disconnect()
            } catch (_: Exception) {}
        }.start()
    }

    private fun readApiUrl(context: Context): String? {
        return try {
            val file = File(context.filesDir, "native_config.json")
            if (file.exists()) {
                JSONObject(file.readText()).optString("apiUrl", null)
            } else null
        } catch (_: Exception) { null }
    }
}
