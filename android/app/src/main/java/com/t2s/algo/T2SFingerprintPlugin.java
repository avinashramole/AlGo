package com.t2s.algo;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "T2SFingerprint")
public class T2SFingerprintPlugin extends Plugin {

    @PluginMethod
    public void available(PluginCall call) {
        int can = BiometricManager.from(getContext())
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK);
        JSObject out = new JSObject();
        out.put("available", can == BiometricManager.BIOMETRIC_SUCCESS);
        out.put("biometryType", "fingerprint");
        call.resolve(out);
    }

    @PluginMethod
    public void verify(PluginCall call) {
        FragmentActivity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("App is not ready for fingerprint.");
            return;
        }
        String reason = call.getString("reason", "Unlock Trade2Smart");
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        JSObject out = new JSObject();
                        out.put("ok", true);
                        call.resolve(out);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        call.reject(String.valueOf(errString));
                    }
                }
            );
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Trade2Smart")
                .setSubtitle(reason)
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK
                )
                .build();
            prompt.authenticate(info);
        });
    }
}
