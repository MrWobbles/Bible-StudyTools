import { editorState } from '../state';

export function getCodeViewHtml(): string | null {
  if (!editorState.isCodeView) return null;
  const codeTextarea = document.getElementById('editor-code-view');
  if (
    editorState.codeMirrorInstance &&
    typeof editorState.codeMirrorInstance.getValue === 'function'
  ) {
    return editorState.codeMirrorInstance.getValue();
  }
  if (codeTextarea instanceof HTMLTextAreaElement) {
    return codeTextarea.value;
  }
  return editorState.editor ? editorState.editor.getHTML() : null;
}

export function toggleCodeView(onDirty: () => void): void {
  const { editor } = editorState;
  if (!editor) return;

  const editorDiv = document.getElementById('editor');
  const codeTextarea = document.getElementById('editor-code-view');
  const codeBtn = document.getElementById('btn-code-view');

  if (!editorDiv || !(codeTextarea instanceof HTMLTextAreaElement) || !codeBtn) return;

  editorState.isCodeView = !editorState.isCodeView;

  if (editorState.isCodeView) {
    // Switch to Code View
    let currentHtml = editor.getHTML();

    // Format HTML if js-beautify is available
    if (window.html_beautify) {
      currentHtml = window.html_beautify(currentHtml, {
        indent_size: 2,
        wrap_attributes: 'auto',
        preserve_newlines: false,
      });
    }

    codeTextarea.value = currentHtml;
    editorDiv.style.display = 'none';
    codeTextarea.style.display = 'block';
    codeBtn.classList.add('is-active');

    // Initialize CodeMirror if available
    if (window.CodeMirror && !editorState.codeMirrorInstance) {
      const cm = window.CodeMirror.fromTextArea(codeTextarea, {
        mode: 'htmlmixed',
        theme: 'material-darker',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
      });
      editorState.codeMirrorInstance = cm;

      // Sync changes from CodeMirror back to textarea
      cm.on('change', () => {
        codeTextarea.value = cm.getValue();
        onDirty();
      });
    }

    if (editorState.codeMirrorInstance) {
      const cm = editorState.codeMirrorInstance;
      cm.getWrapperElement().style.display = 'block';
      cm.setValue(currentHtml);
      // Wait for display to take effect before refreshing
      setTimeout(() => cm.refresh(), 10);
    }
  } else {
    // Switch back to Rich Text View
    const newHtml = editorState.codeMirrorInstance
      ? editorState.codeMirrorInstance.getValue()
      : codeTextarea.value;
    editor.commands.setContent(newHtml);

    if (editorState.codeMirrorInstance) {
      editorState.codeMirrorInstance.getWrapperElement().style.display = 'none';
      editorState.codeMirrorInstance.toTextArea(); // Destroy CodeMirror instance
      editorState.codeMirrorInstance = null;
    } else {
      codeTextarea.style.display = 'none';
    }

    editorDiv.style.display = 'block';
    codeBtn.classList.remove('is-active');

    // Save document since we might have made changes in code view
    onDirty();
  }
}
