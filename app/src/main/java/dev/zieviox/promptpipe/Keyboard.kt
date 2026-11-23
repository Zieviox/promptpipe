package dev.zieviox.promptpipe

import android.content.Context
import android.view.inputmethod.CursorAnchorInfo
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedText
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import kotlin.math.max
import kotlin.math.min

// The keyboard is told a selection in order, start before end. GeckoView tells it as anchor and
// focus, so a selection made bottom to top arrives with its start after its end; keyboards that
// work out its length as end minus start (HeliBoard and other AOSP-based keyboards) then delete
// nothing on Backspace and only drop the selection. Chrome and Android's own text fields hand a
// touch selection over in order. Only what the keyboard is told changes: the selection on the page
// stays as the engine made it (its direction is how it knows which handle you're dragging).

// On unless the setting look.selection_ordered is off (keyboard_set).
object Keyboard {
    @Volatile var ordered = true
}

// A view on a session whose selection reaches the keyboard in order.
fun view_build(context: Context, session: GeckoSession): GeckoView =
    KeyboardView(context).apply { setSession(session.also(::selection_ordered)) }

private class KeyboardView(context: Context) : GeckoView(context) {
    override fun onCreateInputConnection(attrs: EditorInfo): InputConnection? {
        val inner = super.onCreateInputConnection(attrs) ?: return null
        if (!Keyboard.ordered) return inner
        if (attrs.initialSelStart > attrs.initialSelEnd)
            attrs.initialSelStart = attrs.initialSelEnd.also { attrs.initialSelEnd = attrs.initialSelStart }
        return object : InputConnectionWrapper(inner, true) {
            override fun getExtractedText(request: ExtractedTextRequest?, flags: Int): ExtractedText? =
                super.getExtractedText(request, flags)?.also(::text_ordered)
        }
    }
}

private fun text_ordered(text: ExtractedText) {
    if (Keyboard.ordered && text.selectionStart > text.selectionEnd)
        text.selectionStart = text.selectionEnd.also { text.selectionEnd = text.selectionStart }
}

// Every call is passed on by hand: the interface's methods are Java defaults, which Kotlin's
// "by inner" may leave as the empty defaults instead of passing on.
private class OrderedDelegate(val inner: GeckoSession.TextInputDelegate) : GeckoSession.TextInputDelegate {
    override fun restartInput(session: GeckoSession, reason: Int) = inner.restartInput(session, reason)
    override fun showSoftInput(session: GeckoSession) = inner.showSoftInput(session)
    override fun hideSoftInput(session: GeckoSession) = inner.hideSoftInput(session)
    override fun updateCursorAnchorInfo(session: GeckoSession, info: CursorAnchorInfo) =
        inner.updateCursorAnchorInfo(session, info)

    override fun updateSelection(session: GeckoSession, selStart: Int, selEnd: Int, compositionStart: Int, compositionEnd: Int) =
        if (Keyboard.ordered) inner.updateSelection(session, min(selStart, selEnd), max(selStart, selEnd), compositionStart, compositionEnd)
        else inner.updateSelection(session, selStart, selEnd, compositionStart, compositionEnd)

    override fun updateExtractedText(session: GeckoSession, request: ExtractedTextRequest, text: ExtractedText) =
        inner.updateExtractedText(session, request, text.also(::text_ordered))
}

private fun selection_ordered(session: GeckoSession) {
    val input = session.textInput
    val inner = input.getDelegate()
    if (inner !is OrderedDelegate) input.setDelegate(OrderedDelegate(inner))
}
