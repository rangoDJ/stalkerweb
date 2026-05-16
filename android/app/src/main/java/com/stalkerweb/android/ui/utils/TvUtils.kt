package com.stalkerweb.android.ui.utils

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import com.stalkerweb.android.BuildConfig

@Composable
fun rememberIsTV(): Boolean = remember { BuildConfig.IS_TV }
