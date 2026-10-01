mergeInto(LibraryManager.library, {
  Torneos2048Event: function(json) {
    var event = JSON.parse(UTF8ToString(json));
    window.parent.postMessage(event, window.location.origin);
  }
});
