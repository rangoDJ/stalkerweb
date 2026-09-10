package com.stalkerweb.android.ui.portal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stalkerweb.android.data.api.Profile
import com.stalkerweb.android.data.repository.ChannelRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import retrofit2.HttpException

data class PortalUiState(
    val loading: Boolean = true,
    val connected: Boolean = false,
    val portalUrl: String = "",
    val mac: String = "",
    val timezone: String = "Europe/London",
    val lang: String = "en",
    val busy: Boolean = false,
    val error: String? = null,
    val hasSavedConfig: Boolean = false,
    // Saved portal profiles from the server (shared with the web UI) — offered
    // as one-tap connect options instead of making the user retype portal/MAC.
    val profiles: List<Profile> = emptyList(),
    val connectingProfileId: String? = null,
)

class PortalViewModel(private val repository: ChannelRepository) : ViewModel() {

    private val _state = MutableStateFlow(PortalUiState())
    val state: StateFlow<PortalUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val status   = runCatching { repository.testConnection() }.getOrNull()
            val config   = repository.getPortalConfig()
            val profiles = repository.getProfiles().profiles
            val connected = status?.connected == true
            _state.value = _state.value.copy(
                loading         = false,
                // Every action here (connect / connectProfile / reconnect /
                // disconnect) hands off to refresh() on success while busy is
                // still true, so this is the only place that can clear it.
                // Without it the screen latches: `enabled = !state.busy`
                // disables every button for good and the tapped profile row
                // keeps spinning, so a second tap does nothing at all.
                busy               = false,
                connectingProfileId = null,
                connected       = connected,
                portalUrl       = (if (connected) status?.portal else config?.portal) ?: config?.portal ?: "",
                mac             = (if (connected) status?.mac    else config?.mac)    ?: config?.mac    ?: "",
                timezone        = config?.timezone ?: "Europe/London",
                lang            = config?.lang     ?: "en",
                hasSavedConfig  = !config?.portal.isNullOrBlank() && !config?.mac.isNullOrBlank(),
                profiles        = profiles,
            )
        }
    }

    /** Connect using a saved profile — one tap, no retyping portal/MAC. */
    fun connectProfile(profile: Profile) {
        _state.value = _state.value.copy(busy = true, error = null, connectingProfileId = profile.id)
        viewModelScope.launch {
            runCatching { repository.connectProfile(profile) }
                .onSuccess { resp ->
                    if (resp.success) refresh()
                    else _state.value = _state.value.copy(
                        busy = false, connectingProfileId = null,
                        error = resp.error ?: "Connect failed",
                    )
                }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        busy = false, connectingProfileId = null,
                        error = e.backendMessage("Connect failed"),
                    )
                }
        }
    }

    fun setPortalUrl(url: String) { _state.value = _state.value.copy(portalUrl = url, error = null) }
    fun setMac(mac: String)       { _state.value = _state.value.copy(mac = mac, error = null) }

    fun connect() {
        val portal = _state.value.portalUrl.trim()
        val mac    = _state.value.mac.trim()
        if (portal.isBlank()) { _state.value = _state.value.copy(error = "Portal URL is required"); return }
        if (mac.isBlank())    { _state.value = _state.value.copy(error = "MAC address is required"); return }
        _state.value = _state.value.copy(busy = true, error = null)
        viewModelScope.launch {
            runCatching {
                repository.connectPortal(portal, mac, _state.value.timezone, _state.value.lang)
            }.onSuccess { resp ->
                if (resp.success) {
                    refresh()
                } else {
                    _state.value = _state.value.copy(busy = false, error = resp.error ?: "Connect failed")
                }
            }.onFailure { e ->
                _state.value = _state.value.copy(busy = false, error = e.backendMessage("Connect failed"))
            }
        }
    }

    fun reconnect() {
        _state.value = _state.value.copy(busy = true, error = null)
        viewModelScope.launch {
            runCatching { repository.reconnectPortal() }
                .onSuccess { resp ->
                    if (resp.success) refresh()
                    else _state.value = _state.value.copy(busy = false, error = resp.error ?: "Reconnect failed")
                }
                .onFailure { e ->
                    _state.value = _state.value.copy(busy = false, error = e.backendMessage("Reconnect failed"))
                }
        }
    }

    fun disconnect() {
        _state.value = _state.value.copy(busy = true, error = null)
        viewModelScope.launch {
            runCatching { repository.disconnectPortal() }
                .onSuccess { refresh() }
                .onFailure { e ->
                    _state.value = _state.value.copy(busy = false, error = e.backendMessage("Disconnect failed"))
                }
        }
    }
}

/**
 * The backend reports why a connect failed in the response body
 * (`{"error": "…"}`, see routes/auth.js), but Retrofit's HttpException.message
 * is only "HTTP 401 Unauthorized" — so the actual reason never reached the
 * screen and every failure looked alike. Prefer the body's message.
 */
private fun Throwable.backendMessage(fallback: String): String {
    if (this is HttpException) {
        val body = runCatching { response()?.errorBody()?.string() }.getOrNull()
        val fromBody = body?.let {
            runCatching { JSONObject(it).optString("error").takeIf(String::isNotBlank) }.getOrNull()
        }
        return fromBody ?: "HTTP ${code()}"
    }
    return message ?: fallback
}
