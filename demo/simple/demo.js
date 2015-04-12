(function () {
    "use strict";

    var delayInMs = 2000,
        promises = [];

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
    });
})();
