package com.stalkerweb.android.data.api

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

interface StalkerApi {

    @GET("api/auth/status")
    suspend fun getStatus(): StatusResponse

    @GET("api/channels")
    suspend fun getChannels(): ChannelsResponse

    @GET("api/logos/map")
    suspend fun getLogoMap(): Map<String, String>

    @GET("api/channels/groups/all")
    suspend fun getGroups(): GroupsResponse

    @GET("api/favorites")
    suspend fun getFavorites(): FavoritesResponse

    @POST("api/favorites/channels")
    suspend fun addFavorite(@Body body: AddFavoriteRequest)

    @DELETE("api/favorites/channels/{id}")
    suspend fun removeFavorite(@Path("id") id: String)

    @GET("api/epg/now")
    suspend fun getNowNext(): Map<String, NowNextEntry>

    companion object {
        fun create(baseUrl: String): StalkerApi {
            val moshi = Moshi.Builder()
                .addLast(KotlinJsonAdapterFactory())
                .build()

            val client = OkHttpClient.Builder()
                .addInterceptor(HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                })
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .build()

            val normalized = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

            return Retrofit.Builder()
                .baseUrl(normalized)
                .client(client)
                .addConverterFactory(MoshiConverterFactory.create(moshi))
                .build()
                .create(StalkerApi::class.java)
        }
    }
}
