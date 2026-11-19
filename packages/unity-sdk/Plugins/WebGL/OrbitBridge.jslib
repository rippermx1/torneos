mergeInto(LibraryManager.library, {
  Orbit_PostMessage: function (jsonPointer) {
    try {
      var event = JSON.parse(UTF8ToString(jsonPointer));
      // Same-origin first-party builds only. Never use '*' or send account cookies here.
      window.parent.postMessage(event, window.location.origin);
    } catch (error) {
      console.error('[OrbitBridge] Invalid message', error);
    }
  }
});
