package com.stalkerweb.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PictureInPictureParams
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.stalkerweb.android.data.prefs.AppPrefs
import com.stalkerweb.android.data.repository.ChannelRepository
import com.stalkerweb.android.data.update.UpdateManager
import com.stalkerweb.android.ui.channels.ChannelViewModel
import com.stalkerweb.android.ui.player.PlayerViewModel
import com.stalkerweb.android.ui.setup.SetupScreen
import com.stalkerweb.android.ui.channels.ChannelScreen
import com.stalkerweb.android.ui.player.PlayerScreen
import com.stalkerweb.android.ui.theme.StalkerTheme
import com.stalkerweb.android.ui.update.UpdateDialog
import com.stalkerweb.android.ui.update.UpdateViewModel
import java.io.File

class MainActivity : ComponentActivity() {

    private var shouldEnterPipOnLeave = false
    private val isInPipMode = mutableStateOf(false)

    // File waiting to be installed after the user grants "unknown sources" permission.
    private var pendingInstallFile: File? = null

    // Kept so onResume can call refreshHistory() without capturing a stale reference.
    private var channelViewModel: ChannelViewModel? = null

    // Launcher for ACTION_MANAGE_UNKNOWN_APP_SOURCES. Fires install as soon as
    // the user grants permission; silently does nothing if they deny.
    private val unknownSourcesLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // Re-check permission after returning from Settings.
        val file = pendingInstallFile ?: return@registerForActivityResult
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            packageManager.canRequestPackageInstalls()
        ) {
            pendingInstallFile = null
            launchInstallIntent(file)
        }
        // If still not granted, pendingInstallFile is kept so the dialog's
        // "Install" button can try again.
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (shouldEnterPipOnLeave && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(16, 9))
                .build()
            enterPictureInPictureMode(params)
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode)
        isInPipMode.value = isInPictureInPictureMode
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        createNotificationChannel()

        val prefs         = AppPrefs(this)
        val repository    = ChannelRepository(prefs).also { it.initFromPrefs() }
        val updateManager = UpdateManager(this)

        val isTV = BuildConfig.IS_TV

        setContent {
            StalkerTheme {
                Box(Modifier.fillMaxSize().padding(if (isTV) 48.dp else 0.dp)) {
                val navController = rememberNavController()
                val startDest     = if (repository.getServerUrl() != null) Screen.Channels.route
                                    else Screen.Setup.route

                val channelVmFactory = remember {
                    object : ViewModelProvider.Factory {
                        @Suppress("UNCHECKED_CAST")
                        override fun <T : ViewModel> create(modelClass: Class<T>): T =
                            ChannelViewModel(repository) as T
                    }
                }
                val playerVmFactory = remember {
                    object : ViewModelProvider.Factory {
                        @Suppress("UNCHECKED_CAST")
                        override fun <T : ViewModel> create(modelClass: Class<T>): T =
                            PlayerViewModel(application, repository) as T
                    }
                }
                val updateVmFactory = remember {
                    object : ViewModelProvider.Factory {
                        @Suppress("UNCHECKED_CAST")
                        override fun <T : ViewModel> create(modelClass: Class<T>): T =
                            UpdateViewModel(updateManager) as T
                    }
                }

                val channelViewModel: ChannelViewModel = viewModel<ChannelViewModel>(factory = channelVmFactory).also { this@MainActivity.channelViewModel = it }
                val playerViewModel:  PlayerViewModel  = viewModel<PlayerViewModel>(factory = playerVmFactory)
                val updateViewModel:  UpdateViewModel  = viewModel<UpdateViewModel>(factory = updateVmFactory)

                // Collect install events from the ViewModel and handle them here
                // where we have a real Activity context and the result launcher.
                LaunchedEffect(updateViewModel) {
                    updateViewModel.installEvent.collect { file ->
                        handleInstall(file)
                    }
                }

                LaunchedEffect(Unit) { updateViewModel.check() }
                UpdateDialog(updateViewModel)

                NavHost(navController = navController, startDestination = startDest) {

                    composable(Screen.Setup.route) {
                        SetupScreen(
                            repository  = repository,
                            onConnected = {
                                channelViewModel.load()
                                navController.navigate(Screen.Channels.route) {
                                    popUpTo(Screen.Setup.route) { inclusive = true }
                                }
                            },
                        )
                    }

                    composable(Screen.Channels.route) {
                        ChannelScreen(
                            viewModel       = channelViewModel,
                            onSelectChannel = { channel ->
                                navController.navigate(Screen.Player.go(channel.uniqueId, channel.name))
                            },
                        )
                    }

                    composable(
                        route = Screen.Player.route,
                        arguments = listOf(
                            navArgument("channelId")   { type = NavType.StringType },
                            navArgument("channelName") { type = NavType.StringType },
                        ),
                    ) { backStack ->
                        val channelId   = backStack.arguments?.getString("channelId")   ?: ""
                        val channelName = backStack.arguments?.getString("channelName") ?: ""
                        PlayerScreen(
                            channelId        = channelId,
                            channelName      = channelName,
                            viewModel        = playerViewModel,
                            isInPipMode      = isInPipMode.value,
                            onSetPipEnabled  = { shouldEnterPipOnLeave = it },
                            onBack           = { navController.popBackStack() },
                        )
                    }
                }
                } // end overscan Box
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Refresh so "Continue watching" shows channels added during the player session
        channelViewModel?.refreshHistory()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                UpdateManager.CHANNEL_ID,
                UpdateManager.CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Update download progress" }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun handleInstall(file: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !packageManager.canRequestPackageInstalls()
        ) {
            pendingInstallFile = file
            unknownSourcesLauncher.launch(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:$packageName")
                )
            )
            return
        }
        launchInstallIntent(file)
    }

    private fun launchInstallIntent(file: File) {
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
    }
}
