package com.stalkerweb.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.remember
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
import com.stalkerweb.android.ui.channels.ChannelViewModel
import com.stalkerweb.android.ui.player.PlayerViewModel
import com.stalkerweb.android.ui.setup.SetupScreen
import com.stalkerweb.android.ui.channels.ChannelScreen
import com.stalkerweb.android.ui.player.PlayerScreen
import com.stalkerweb.android.ui.theme.StalkerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val prefs      = AppPrefs(this)
        val repository = ChannelRepository(prefs).also { it.initFromPrefs() }

        setContent {
            StalkerTheme {
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
                            PlayerViewModel(repository) as T
                    }
                }

                val channelViewModel: ChannelViewModel = viewModel(factory = channelVmFactory)
                val playerViewModel:  PlayerViewModel  = viewModel(factory = playerVmFactory)

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
                            channelId   = channelId,
                            channelName = channelName,
                            viewModel   = playerViewModel,
                            onBack      = { navController.popBackStack() },
                        )
                    }
                }
            }
        }
    }
}
