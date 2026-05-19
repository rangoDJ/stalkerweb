package com.stalkerweb.android

import android.app.PictureInPictureParams
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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

class MainActivity : ComponentActivity() {

    private var shouldEnterPipOnLeave = false
    private val isInPipMode = mutableStateOf(false)

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

        val prefs         = AppPrefs(this)
        val repository    = ChannelRepository(prefs).also { it.initFromPrefs() }
        val updateManager = UpdateManager(this)

        val isTV = BuildConfig.IS_TV

        setContent {
            StalkerTheme {
                // Apply overscan safe-zone on TV so content stays away from screen edges
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

                val channelViewModel: ChannelViewModel = viewModel(factory = channelVmFactory)
                val playerViewModel:  PlayerViewModel  = viewModel(factory = playerVmFactory)
                val updateViewModel:  UpdateViewModel  = viewModel(factory = updateVmFactory)

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
}
