# Keep the WebView JavaScript interface if one is added later.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
