package com.smartparkingapp

import android.app.Application
import androidx.work.*
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.ReactPackage
import java.util.concurrent.TimeUnit

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages + listOf(LicensePlatePackage()),
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    scheduleBootSync()
  }

  private fun scheduleBootSync() {
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()

    val bootRequest = OneTimeWorkRequestBuilder<SyncWorker>()
      .setConstraints(constraints)
      .setInitialDelay(2, TimeUnit.SECONDS)
      .build()

    WorkManager.getInstance(this).enqueueUniqueWork(
      "sync_boot",
      ExistingWorkPolicy.KEEP,
      bootRequest
    )
  }
}
