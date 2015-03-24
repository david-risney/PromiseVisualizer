(function () {
    "use strict";

    var watcher = new Watcher(),
        cv = new ConsoleVisualizer(watcher),
        dv = new D3ForceVisualizer(watcher),
        delayInMs = 2000,
        promises = [];

    watcher.shimPromiseFn("Q.delay");
    watcher.shimPromiseFn("Q.all");

    function chain() {
        return Q.delay(delayInMs).then(function () {
            return Q.delay(delayInMs);
        }).then(function () {
            return Q.delay(delayInMs);
        }).then(function () {
            return Q.delay(delayInMs);
        }).then(function () {
            return Q.delay(delayInMs);
        });
    }

    function addChain() {
        promises.push(chain());
    }

    function addAll() {
        var oldPromises = promises;
        promises = [Q.all(oldPromises)];
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.getElementById("addChain").addEventListener("click", addChain);
        document.getElementById("addAll").addEventListener("click", addAll);
        dv.initializeAsync();
    });

})();
