package com.stalkerweb.android.ui.portal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stalkerweb.android.data.repository.ChannelRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

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
)

class PortalViewModel(private val repository: ChannelRepository) : ViewModel() {

    private val _state = MutableStateFlow(PortalUiState())
    val state: StateFlow<PortalUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val status = runCatching { repository.testConnection() }.getOrNull()
            val config = repository.getPortalConfig()
            val connected = status?.connected == true
            _state.value = _state.value.copy(
                loading         = false,
                connected       = connected,
                portalUrl       = (if (connected) status?.portal else config?.portal) ?: config?.portal ?: "",
                mac             = (if (connected) status?.mac    else config?.mac)    ?: config?.mac    ?: "",
                timezone        = config?.timezone ?: "Europe/London",
                lang            = config?.lang     ?: "en",
                hasSavedConfig  = !config?.portal.isNullOrBlank() && !config?.mac.isNullOrBlank(),
            )
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
                _state.value = _state.value.copy(busy = false, error = e.message ?: "Connect failed")
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
                    _state.value = _state.value.copy(busy = false, error = e.message ?: "Reconnect failed")
                }
        }
    }

    fun disconnect() {
        _state.value = _state.value.copy(busy = true, error = null)
        viewModelScope.launch {
            runCatching { repository.disconnectPortal() }
                .onSuccess { refresh() }
                .onFailure { e ->
                    _state.value = _state.value.copy(busy = false, error = e.message ?: "Disconnect failed")
                }
        }
    }
}
