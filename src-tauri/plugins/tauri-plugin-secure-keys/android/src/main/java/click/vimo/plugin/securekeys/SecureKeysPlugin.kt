package click.vimo.plugin.securekeys

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class AccountArgs {
  lateinit var account: String
}

@InvokeArg
class SetArgs {
  lateinit var account: String
  lateinit var value: String
}

/**
 * Cifrado de claves API con el Android Keystore (ADR-0011).
 *
 * Una clave AES-256-GCM se genera dentro del AndroidKeyStore (hardware-backed
 * cuando el dispositivo lo soporta) y nunca sale de él; los valores cifrados
 * (IV + ciphertext, base64) viven en SharedPreferences privadas de la app.
 * No usamos EncryptedSharedPreferences: androidx.security-crypto está deprecado.
 */
@TauriPlugin
class SecureKeysPlugin(private val activity: Activity) : Plugin(activity) {
  companion object {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "vimo-api-keys"
    private const val PREFERENCES_FILE = "vimo_secure_keys"
    private const val GCM_TAG_LENGTH_BITS = 128
    private const val ENTRY_SEPARATOR = ":"
  }

  private val preferences: SharedPreferences by lazy {
    activity.getSharedPreferences(PREFERENCES_FILE, Context.MODE_PRIVATE)
  }

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
    keyStore.load(null)

    val existing = keyStore.getKey(KEY_ALIAS, null)
    if (existing is SecretKey) return existing

    val generator = KeyGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_AES,
      KEYSTORE_PROVIDER,
    )
    val spec = KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      // Sin biometría: el keystore ya protege con la sesión del usuario y el
      // pipeline necesita leer claves sin fricción extra.
      .setUserAuthenticationRequired(false)
      .build()
    generator.init(spec)
    return generator.generateKey()
  }

  private fun encrypt(plainText: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val cipherText = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
    val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    val payload = Base64.encodeToString(cipherText, Base64.NO_WRAP)
    return iv + ENTRY_SEPARATOR + payload
  }

  private fun decrypt(storedValue: String): String? {
    val parts = storedValue.split(ENTRY_SEPARATOR)
    if (parts.size != 2) return null

    val iv = Base64.decode(parts[0], Base64.NO_WRAP)
    val cipherText = Base64.decode(parts[1], Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
    return String(cipher.doFinal(cipherText), Charsets.UTF_8)
  }

  @Command
  fun get(invoke: Invoke) {
    val args = invoke.parseArgs(AccountArgs::class.java)
    val stored = preferences.getString(args.account, null)
    val result = JSObject()

    if (stored == null) {
      result.put("value", null)
      invoke.resolve(result)
      return
    }

    try {
      result.put("value", decrypt(stored))
      invoke.resolve(result)
    } catch (error: Exception) {
      // Entrada corrupta o clave del keystore rotada: se trata como ausente.
      result.put("value", null)
      invoke.resolve(result)
    }
  }

  @Command
  fun set(invoke: Invoke) {
    val args = invoke.parseArgs(SetArgs::class.java)
    try {
      preferences.edit().putString(args.account, encrypt(args.value)).apply()
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "keystore_error")
    }
  }

  @Command
  fun delete(invoke: Invoke) {
    val args = invoke.parseArgs(AccountArgs::class.java)
    preferences.edit().remove(args.account).apply()
    invoke.resolve()
  }
}
