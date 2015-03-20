(function () {
    "use strict";

    var watcher = new Watcher(),
        cv = new ConsoleVisualizer(watcher),
        dv = new D3Visualizer(watcher),
        delayInMs = 1000,
        promises = [];

    function chain() {
        return watcher.watch(Q.delay(delayInMs)).then(function () {
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
        promises = [watcher.watch(Q.all(oldPromises), oldPromises)];
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.getElementById("addChain").addEventListener("click", addChain);
        document.getElementById("addAll").addEventListener("click", addAll);
        dv.initializeAsync();
    });

})();
