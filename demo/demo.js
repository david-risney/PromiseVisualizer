(function () {
    "use strict";

    var watcher = new Watcher(),
        recorder = new Recorder(watcher),
        cv = new ConsoleVisualizer(recorder),
        dv = new D3ForceVisualizer(recorder, "graphForce"),
        gv = new D3DagreVisualizer(recorder, "graphDagre"),
        pv = new PromiseInfoDisplay(recorder, "graphSelection"),
        delayInMs = 2000,
        promises = [];

    watcher.shimPromiseFn("Q");
    watcher.shimPromiseFn("Q.delay");
    watcher.shimPromiseFn("Q.timeout");
    watcher.shimPromiseCtorFn("Q.Promise");
    watcher.shimPromiseCompositorFn("Q.all");

    function chain() {
        return Q(10).then(function () {
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
        gv.initializeAsync();
        pv.initializeAsync();
    });

})();
