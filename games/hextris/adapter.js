(function () {
    'use strict';

    // The legacy function serializer requires unsafe-eval when restoring a run.
    // Start clean instead so the self-hosted game can keep a restrictive CSP.
    localStorage.removeItem('saveState');

    function post(type) {
        if (window.parent === window) return;
        window.parent.postMessage({type: type, id: 'hextris'}, location.origin);
    }

    var ready = false;
    window.addEventListener('DOMContentLoaded', function () {
        post('game:progress');
        var deadline = performance.now() + 10000;
        (function check() {
            var canvas = document.getElementById('canvas');
            if (canvas && canvas.width > 0 && canvas.height > 0 && window.MainHex && typeof window.gameState === 'number') {
                ready = true;
                canvas.tabIndex = 0;
                canvas.focus();
                post('game:ready');
                var repeats = 0;
                var timer = setInterval(function () {
                    post('game:ready');
                    if (++repeats === 10) clearInterval(timer);
                }, 500);
            } else if (performance.now() < deadline) {
                requestAnimationFrame(check);
            } else {
                post('game:error');
            }
        }());
    });
    window.addEventListener('error', function () {
        if (!ready) post('game:error');
    });
}());
