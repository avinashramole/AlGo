package com.t2s.algo;

import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JsResult;
import android.webkit.WebView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.view.ContextThemeWrapper;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebChromeClient(new TinyConfirmChromeClient(bridge));
        }
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    static final class TinyConfirmChromeClient extends BridgeWebChromeClient {

        TinyConfirmChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            if (view.getContext() instanceof android.app.Activity activity && activity.isFinishing()) {
                result.confirm();
                return true;
            }
            Toast.makeText(view.getContext(), String.valueOf(message), Toast.LENGTH_LONG).show();
            result.confirm();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            if (view.getContext() instanceof android.app.Activity activity && activity.isFinishing()) {
                return true;
            }
            showTinyConfirm(view, message, result);
            return true;
        }

        private void showTinyConfirm(WebView view, String message, JsResult result) {
            ContextThemeWrapper ctx = new ContextThemeWrapper(view.getContext(), R.style.AppTheme_NoActionBar);
            Dialog dialog = new Dialog(ctx, R.style.TinyConfirmDialog);
            View body = LayoutInflater.from(ctx).inflate(R.layout.logout_confirm, null, false);
            TextView title = body.findViewById(R.id.logout_title);
            TextView copy = body.findViewById(R.id.logout_message);
            TextView cancel = body.findViewById(R.id.logout_cancel);
            TextView ok = body.findViewById(R.id.logout_ok);
            boolean logout = String.valueOf(message).toLowerCase().contains("log out");
            if (logout) {
                title.setText(R.string.logout_title);
                copy.setText(R.string.logout_message);
                cancel.setText(R.string.logout_cancel);
                ok.setText(R.string.logout_confirm);
            } else {
                title.setVisibility(View.GONE);
                copy.setText(message);
                cancel.setText(android.R.string.cancel);
                ok.setText(android.R.string.ok);
            }
            final boolean[] done = { false };
            View.OnClickListener yes = v -> {
                if (done[0]) {
                    return;
                }
                done[0] = true;
                dialog.dismiss();
                result.confirm();
            };
            View.OnClickListener no = v -> {
                if (done[0]) {
                    return;
                }
                done[0] = true;
                dialog.dismiss();
                result.cancel();
            };
            cancel.setOnClickListener(no);
            ok.setOnClickListener(yes);
            dialog.setOnCancelListener(d -> {
                if (done[0]) {
                    return;
                }
                done[0] = true;
                result.cancel();
            });
            dialog.setContentView(body);
            Window window = dialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                window.setDimAmount(0.08f);
                window.setGravity(Gravity.BOTTOM | Gravity.END);
                WindowManager.LayoutParams params = window.getAttributes();
                params.width = WindowManager.LayoutParams.WRAP_CONTENT;
                params.height = WindowManager.LayoutParams.WRAP_CONTENT;
                params.x = 12;
                params.y = 88;
                window.setAttributes(params);
            }
            dialog.show();
        }
    }
}
