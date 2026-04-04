# ── React Native (keep all classes used by JS bridge) ──
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.**

# ── Our native modules (called via React Native bridge) ──
-keep class com.smartparkingapp.** { *; }

# ── Gson (keep data classes used for JSON serialisation) ──
-keep class com.google.gson.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.smartparkingapp.Attendant { *; }
-keep class com.smartparkingapp.ParkingLog { *; }
-keep class com.smartparkingapp.TodayStats { *; }
-keep class com.smartparkingapp.AuthResult { *; }
-keep class com.smartparkingapp.Detection { *; }
-keep class com.smartparkingapp.LprResult { *; }
-keep class com.smartparkingapp.LprFullResult { *; }

# ── ONNX Runtime ──
-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**

# ── OkHttp ──
-dontwarn okhttp3.**
-dontwarn okio.**

# ── Kotlin Coroutines ──
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }

# ── React Native specific recommendations ──
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
