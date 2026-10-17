import Foundation
import Capacitor
import LocalAuthentication

@objc(T2SFingerprintPlugin)
public class T2SFingerprintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "T2SFingerprintPlugin"
    public let jsName = "T2SFingerprint"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verify", returnType: CAPPluginReturnPromise),
    ]

    @objc func available(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var error: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        var kind = "fingerprint"
        if ctx.biometryType == .faceID {
            kind = "face"
        }
        call.resolve([
            "available": ok,
            "biometryType": kind,
        ])
    }

    @objc func verify(_ call: CAPPluginCall) {
        let ctx = LAContext()
        let reason = call.getString("reason") ?? "Unlock Trade2Smart"
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["ok": true])
                } else {
                    call.reject(error?.localizedDescription ?? "Fingerprint cancelled")
                }
            }
        }
    }
}
