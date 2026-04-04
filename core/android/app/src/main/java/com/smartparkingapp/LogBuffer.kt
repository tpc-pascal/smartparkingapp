package com.smartparkingapp

import java.text.SimpleDateFormat
import java.util.*

object LogBuffer {
    private const val MAX_LINES = 300
    private val buffer = ArrayDeque<String>(MAX_LINES)
    private val dateFmt = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    @Synchronized
    fun add(msg: String) {
        val line = "[${dateFmt.format(Date())}] $msg"
        if (buffer.size >= MAX_LINES) buffer.removeFirst()
        buffer.addLast(line)
    }

    @Synchronized
    fun getLast(count: Int): List<String> {
        return buffer.toList().takeLast(count.coerceAtMost(MAX_LINES))
    }

    @Synchronized
    fun clear() {
        buffer.clear()
    }
}
