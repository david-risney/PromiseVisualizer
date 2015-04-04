(function (root) {
    "use strict";

    function fromArray(arrayLike) {
        var array = [];
        for (var idx = 0; idx < arrayLike.length; ++idx) {
            array.push(arrayLike[idx]);
        }
        return array;
    }

    root.Recorder = function Recorder(watcher) {
        var eventTarget = new EventTarget(this, ["promise", "connection", "success", "failure", "selection", "time"]),
            events = [],
            eventPosition = 0, // 0 = no events. 1 = the first eventt. length - 1 = all but the last event. length is all events and stays at all events.
            selectedId,
            minTime = Infinity,
            maxTime = -Infinity;

        function updateTime(time) {
            if (time.getTime) {
                time = time.getTime();
            }
            if (minTime > time) {
                minTime = time;
            }
            if (maxTime < time) {
                maxTime = time;
            }
        }

        function copyEvent(event) {
            var eventCopy = {};
            for (var name in event) {
                eventCopy[name] = event[name];
            }
            return eventCopy;
        }

        function noteEvent(event) {
            events.push(event);
            updateTime(event.date);
        }

        function dispatchEvent(event) {
            var eventCopy = copyEvent(event);
            eventTarget.dispatchEvent(event.type, eventCopy);
        }

        function handleEvent(event) {
            var atEnd = eventPosition === events.length;
            noteEvent(copyEvent(event));
            if (atEnd) {
                dispatchEvent(event);
                eventPosition = events.length;
            }
        }

        watcher.addEventListener("promise", handleEvent);
        watcher.addEventListener("connection", handleEvent);
        watcher.addEventListener("success", handleEvent);
        watcher.addEventListener("failure", handleEvent);

        function fireTimeChange() {
            var time = -Infinity,
                percent = 0,
                startTime,
                endTime;

            if (eventPosition === events.length) {
                time = Infinity;
                percent = 1;
            } else if (eventPosition > 0 && events.length > 0) {
                startTime = events[0].date.getTime();
                endTime = events[events.length - 1].date.getTime();
                time = events[eventPosition - 1].date.getTime();
                percent = (time - startTime) / (endTime - startTime);
            }

            eventTarget.dispatchTimeEvent({
                time: time,
                percent: percent
            });
        }

        function step(forwardDirection) {
            if (forwardDirection) {
                if (eventPosition < events.length) {
                    // 0 = no events, 1 = 0th event => fire redo event under index before increment.
                    events[eventPosition].undo = false;
                    dispatchEvent(events[eventPosition]);
                    ++eventPosition;
                    fireTimeChange();
                }
            } else {
                if (eventPosition > 0) {
                    // 1 = 0th event, 0 = no events => fire undo event under index after decrement.
                    --eventPosition;
                    events[eventPosition].undo = true;
                    dispatchEvent(events[eventPosition]);
                    fireTimeChange();
                }
            }
        };
        this.step = step;

        // percent is [0, 1]
        // The following logic should be revisited. Ugly and probably wrong.
        this.travelToPercent = function travelToPercent(percent) {
            var desiredTime = (maxTime - minTime) * percent + minTime,
                currentTime;

            if (eventPosition === 0) {
                currentTime = -Infinity;
            }
            else if (eventPosition === events.length) {
                currentTime = Infinity;
            }
            else {
                currentTime = events[eventPosition - 1].date.getTime();
            }

            if (currentTime < desiredTime) {
                while (true) {
                    var nextTime = eventPosition < events.length ? events[eventPosition].date.getTime() : Infinity;
                    if (nextTime <= desiredTime && eventPosition < events.length) {
                        step(true);
                    } else {
                        break;
                    }
                }
            } else {
                while (true) {
                    var nextTime = eventPosition > 1 ? events[eventPosition - 2].date.getTime() : -Infinity;
                    if (nextTime >= desiredTime && eventPosition > 0) {
                        step(false);
                    } else {
                        break;
                    }
                }
            }
        };

        this.setSelectionId = function setSelectionId(id) {
            selectedId = id;
            eventTarget.dispatchSelectionEvent(selectedId);
        };
    };

    root.Watcher = function Watcher(settings) {
        var nextId = (function () {
                var id = 0;
                return function () { return id++; }
            })(),
            stackContext = (function () {
                var contextStack = [];
                return {
                    pushWatcher: function (context) { contextStack.push(context); },
                    pop: function () { contextStack.pop(); },
                    getPromiseAsArray: function () { return contextStack.length > 0 ? [ contextStack[contextStack.length - 1].promise ] : []; }
                };
            })();

        settings = settings || {};
        settings.filterFrames = settings.filterFrames || ["/q.js", "/promiseVisualizer.js"];

        var eventTarget = new EventTarget(this, ["promise", "connection", "success", "failure"]);

        //  settings.root - root object from which to find function named by fnFullName. Defaults to window
        //  settings.bindThis - the original function passed to new function will have its this bound. Defaults to true
        //  settings.bindParameters - the original function passed to new function will have its this and runtime original paramters bound. Defaults to false
        function shimFn(fnFullName, newFn, settings) {
            settings = settings || {};

            var fnFullNameParts = fnFullName.split("."),
                fnName = fnFullNameParts[fnFullNameParts.length - 1],
                fnContainer = fnFullNameParts.slice(0, fnFullNameParts.length - 1).reduce(function (total, next) { return total[next]; }, settings.root || window),
                originalFn = fnContainer[fnName],
                boundOriginalFn = originalFn;

            if (settings.bindThis === undefined || settings.bindThis) {
                boundOriginalFn = originalFn.bind(fnContainer);
            }

            fnContainer[fnName] = function () {
                var reboundOriginalFn = boundOriginalFn;
                if (settings.bindParameters) {
                    reboundOriginalFn = boundOriginalFn.bind.apply(boundOriginalFn, [fnContainer].concat(fromArray(arguments)));
                }
                return newFn.apply(fnContainer, [reboundOriginalFn].concat(fromArray(arguments)));
            };

            for (var name in originalFn) {
                try {
                    fnContainer[fnName][name] = originalFn[name];
                } catch (e) {
                    console.error("Unable to read " + name + " from " + fnFullName);
                }
            }
        }

        function getCurrentStack() {
            var stack = "";
            try {
                throw new Error();
            } catch (e) {
                stack = e.stack.split("\n");
                stack.splice(0, 1);
                stack = stack.filter(function (stackFrame) { 
                    return !settings.filterFrames.some(function (checkFrame) {
                        return stackFrame.indexOf(checkFrame) !== -1; 
                    });
                });
            }
            return stack;
        }

        function getPromiseWatcher(promise) { 
            return promise && promise.promiseVisualizerWatcher; 
        }

        function setPromiseWatcher(promise, watcher) { 
            if (getPromiseWatcher(promise) !== undefined) {
                throw new Error("Cannot overwrite previous watcher on promise.");
            }
            promise.promiseVisualizerWatcher = watcher; 
        }

        function getOrCreateWatcherForPromise(promise) {
            var watcher = getPromiseWatcher(promise);
            if (!watcher) {
                watcher = new PromiseWatcher(promise);
            }
            return watcher;
        }

        function createWatcherForNewPromise() {
            return new PromiseWatcher();
        }

        // Two scenarios for creating a PromiseWatcher:
        //  1. Created around a pre-existing promise passed in via ctor. The promise
        //      may already have a pre-existing PromiseWatcher. If so, we return that.
        //      This is the generic promise case.
        //  2. Created with no promise and setNewPromise is called later with a newly
        //      created promise that has no pre-existing PromiseWatcher. This is the
        //      Promise ctor case.
        function PromiseWatcher(promiseOptional) {
            var id,
                settled = false,
                watcher,
                eventsPendingCreation = [];

            function createEventArgument(type, additional) {
                var eventArgument = {
                        type: type,
                        id: id,
                        date: (new Date()),
                        stack: getCurrentStack()
                    }, 
                    name;

                if (additional) {
                    for (name in additional) {
                        eventArgument[name] = additional[name];
                    }
                }

                return eventArgument;
            }

            this.id = id = nextId();
            this.addParent = function (parent) {
                eventTarget.dispatchConnectionEvent(createEventArgument("connection", { parentId: getPromiseWatcher(parent).id, childId: id }));
            }

            this.resolve = (function (value) {
                var eventArgument = createEventArgument("success", { value: value });
                if (!settled) {
                    if (this.promise) {
                        eventTarget.dispatchSuccessEvent(eventArgument);
                        settled = true;
                    } else {
                        eventsPendingCreation.push(eventTarget.dispatchSuccessEvent.bind(eventTarget, eventArgument));
                    }
                }
            }).bind(this);

            this.reject = function (value) {
                var eventArgument = createEventArgument("failure", { value: value });
                if (!settled) {
                    if (this.promise) {
                        eventTarget.dispatchFailureEvent(eventArgument);
                        settled = true;
                    } else {
                        eventsPendingCreation.push(eventTarget.dispatchFailureEvent.bind(eventTarget, eventArgument));
                    }
                }
            }

            this.setNewPromise = (function (promise) {
                if (!this.promise && getPromiseWatcher(promise) === undefined) {
                    this.promise = promise;
                    setPromiseWatcher(promise, this);
                    eventTarget.dispatchPromiseEvent(createEventArgument("promise"));

                    eventsPendingCreation.forEach(function (eventFn) { eventFn(); });
                    eventsPendingCreation = null;
                } else if (promise !== null && promise !== this.promise) {
                    throw new Error("Cannot watch promise that's already watched or I'm already watching a promise.");
                }
            }).bind(this);

            if (promiseOptional) {
                this.setNewPromise(promiseOptional);
            }
        }

        function wrapPromise(promise, parents) {
            var originalThen = promise.then.bind(promise),
                watcher = getOrCreateWatcherForPromise(promise);

            parents = (parents || []).concat(stackContext.getPromiseAsArray());
            parents.forEach(function (parent) { watcher.addParent(parent); });

            originalThen(function (value) {
                var promiseSource = promise;
                do {
                    promiseSource = promiseSource.source;
                } while (promiseSource && !getPromiseWatcher(promiseSource) && promiseSource.source);
                if (promiseSource && getPromiseWatcher(promiseSource)) {
                    watcher.addParent(promiseSource);
                }
                watcher.resolve(value);
            }, function (value) {
                var promiseSource = promise;
                do {
                    promiseSource = promiseSource.source;
                } while (promiseSource && !getPromiseWatcher(promiseSource) && promiseSource.source);
                if (promiseSource && getPromiseWatcher(promiseSource)) {
                    watcher.addParent(promiseSource);
                }
                watcher.reject(value);
            });

            promise.then = function (successCallback, failureCallback, progressCallback) {
                return wrapPromise(originalThen(function (value) {
                    var result;
                    stackContext.pushWatcher(watcher);
                    try {
                        result = successCallback(value);
                    } finally {
                        stackContext.pop();
                    }
                    return result;
                }, function(value) {
                    var result;
                    stackContext.pushWatcher(watcher);
                    try {
                        result = failureCallback(value);
                    } finally {
                        stackContext.pop();
                    }
                    return result;
                }, progressCallback), [ promise ]);
            };

            return promise;
        };
        this.wrapPromise = wrapPromise;

        this.shimPromiseFn = function shimPromiseFn(promiseFnFullName) {
            shimFn(promiseFnFullName, function (originalPromiseFn) {
                return wrapPromise(originalPromiseFn());
            }, { bindParameters: true });
        };

        this.shimPromiseCompositorFn = function shimPromiseCompositorFn(promiseCompositorFnFullName) {
            shimFn(promiseCompositorFnFullName, function (originalPromiseFn) {
                var parents = fromArray(arguments).reduce(function (arr, next) { 
                    if (next && typeof(next.forEach) === "function") { 
                        next.forEach(function (value) { arr.push(value); });
                    } else {
                        arr.push(next);
                    }
                    return arr;
                }, []).filter(function (value) {
                    return value && typeof(value.then) === "function";
                });
                return wrapPromise(originalPromiseFn(), parents);
            }, { bindParameters: true });
        };

        this.shimPromiseCtorFn = function shimPromiseCtor(promiseCtorFullName) {
            shimFn(promiseCtorFullName, function wrapPromiseCtorFn(originalPromiseCtor, promiseCtorCallback) {
                var promise,
                    watcher = createWatcherForNewPromise();

                promise = originalPromiseCtor(function (resolveCallback, rejectCallback) {
                    promiseCtorCallback(function (value) {
                        watcher.resolve(value);
                        resolveCallback(value);
                    }, function (value) {
                        watcher.reject(value);
                        rejectCallback(value);
                    });
                });
                watcher.setNewPromise(promise);
                wrapPromise(promise);
            });
        };
    };

    root.ConsoleVisualizer = function ConsoleVisualizer(watcher, console) {
        console = console || root.console;

        ["promise", "connection", "success", "failure"].forEach(function (eventName) {
            watcher.addEventListener(eventName, function (eventArgument) {
                console.log(eventArgument.type + "(" + eventArgument.id + "): " + JSON.stringify(eventArgument));
            });
        });
    };

    root.D3DagreVisualizer = function D3DagreVisualizer(watcher, graphParentName) {
        var graphData = new dagreD3.graphlib.Graph() 
            .setGraph({}) 
            .setDefaultEdgeLabel(function() { return {}; }); 

        var queuedEvents = [],
            promises = [],
            idToPromise = {},
            render,
            svg,
            svgGroup;

        function processEvent(event) {
            if (!queuedEvents) {
                switch (event.type) {
                case "promise":
                    promises.push(event);
                    idToPromise[event.id] = event;
 
                    graphData.setNode(event.id, { context: event, shape: "circle", label: "" + event.id, style: " stroke: #333; fill: #fff; stroke-width: 1.5px; " });
                    break;

                case "connection":
                    graphData.setEdge(event.parentId, event.childId, { style: " stroke: #333; fill: #fff; stroke-width: 1.5px; " });
                    break;

                case "success":
                case "failure":
                    idToPromise[event.id].resolution = event;
                    var color = event.type === "success" ? "green" : "red";
                    graphData.setNode(event.id, { context: idToPromise[event.id], shape: "circle", label: "" + event.id, style: " stroke: #333; fill: " + color + "; stroke-width: 1.5px; "  });
                    break;
                }
                render(d3.select("#" + graphParentName + " svg g"), graphData);
                d3.select("g.node").on("click", function (nodeTitle) {
                    watcher.setSelectionId(parseInt(nodeTitle));
                });
            } else {
                queuedEvents.push(event);
            }
        }

        function processQueuedEvents() {
            svg = d3.select("#" + graphParentName).append("svg");
            svgGroup = svg.append("g"); 
            graphData.graph().rankdir = "LR";
            graphData.graph().ranksep = 15; 
            graphData.graph().nodesep = 15; 

            var zoom = d3.behavior.zoom().on("zoom", function() { 
                svgGroup.attr("transform", "translate(" + d3.event.translate + ")" + 
                    "scale(" + d3.event.scale + ")"); 
                }); 
            svg.call(zoom); 

            var initialScale = 0.5; 
            zoom.translate([(svg.attr("width") - graphData.graph().width * initialScale) / 2, 20]) 
                .scale(initialScale) 
                .event(svg); 
            svg.attr("height", graphData.graph().height * initialScale + 40); 

            render = new dagreD3.render();
            
            queuedEvents.forEach(processEvent);
            queuedEvents = null;
        }

        watcher.addEventListener("promise", processEvent);
        watcher.addEventListener("connection", processEvent);
        watcher.addEventListener("success", processEvent);
        watcher.addEventListener("failure", processEvent);

        this.initializeAsync = processQueuedEvents;
    };

    root.D3ForceVisualizer = function D3ForceVisualizer(watcher, graphParentName) {
        function ForceGraph(el) {
            // Add and remove elements on the graph object
            this.addNode = function (id, context) {
                nodes.push({ id: id, context: context });
                update();
            }

            this.removeNode = function (id) {
                var i = 0;
                var n = findNode(id);
                while (i < links.length) {
                    if ((links[i]['source'] === n)||(links[i]['target'] == n)) links.splice(i,1);
                    else i++;
                }
                var index = findNodeIndex(id);
                if(index !== undefined) {
                    nodes.splice(index, 1);
                    update();
                }
            }

            this.addLink = function (sourceId, targetId) {
                var sourceNode = findNode(sourceId);
                var targetNode = findNode(targetId);

                if((sourceNode !== undefined) && (targetNode !== undefined)) {
                    links.push({"source": sourceNode, "target": targetNode});
                    update();
                }
            }

            var findNode = function (id) {
                for (var i=0; i < nodes.length; i++) {
                    if (nodes[i].id === id)
                        return nodes[i]
                };
            }

            var findNodeIndex = function (id) {
                for (var i=0; i < nodes.length; i++) {
                    if (nodes[i].id === id)
                        return i
                };
            }

            // set up the D3 visualisation in the specified element
            var w = 500, // document.querySelector(el).clientWidth,
                h = 500; // document.querySelector(el).clientHeight;

            var vis = this.vis = d3.select(el).append("svg:svg")
                .attr("width", w)
                .attr("height", h);

            vis.select("defs")
                .append("marker")
                .attr("id", "TriangleUnselected")
                .attr("viewBox", "0 0 10 10")
                .attr("refX", "12")
                .attr("refY", "5")
                .attr("class", "link marker unselected")
                .attr("markerUnits", "strokeWidth")
                .attr("markerWidth", "4")
                .attr("markerHeight", "3")
                .attr("orient", "auto")
                .append("path")
                .attr("d", "M 0 0 L 10 5 L 0 10 z");

            var force = d3.layout.force()
                .gravity(.05)
                .distance(100)
                .charge(-100)
                .size([w, h]);

            var nodes = force.nodes(),
                links = force.links();

            var update = function () {
                var link = vis.selectAll("line.link")
                    .data(links, function(d) { return d.source.id + "-" + d.target.id; });

                link.enter().insert("line")
                    .attr("style", "stroke-width: 2px; stroke: gray;")
                    //.attr("marker-end", "url(#TriangleUnselected)")
                    .attr("class", "link");

                link.exit().remove();

                var node = vis.selectAll("g.node")
                    .data(nodes, function(d) { return d.id;});

                var nodeEnter = node.enter().append("g")
                    .attr("class", "node")
                    .on("click", function (node) { 
                        watcher.setSelectionId(node.context.id);
                    }).call(force.drag);

                nodeEnter.append("circle")
                    .attr("r", "6");


                nodeEnter.append("text")
                    .attr("class", "nodetext")
                    .attr("dx", 12)
                    .attr("dy", ".35em")
                    .text(function(d) {return d.id});

                node.exit().remove();

                force.on("tick", function() {
                    link.attr("x1", function(d) { return d.source.x; })
                      .attr("y1", function(d) { return d.source.y; })
                      .attr("x2", function(d) { return d.target.x; })
                      .attr("y2", function(d) { return d.target.y; });

                    node.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });

                    node.selectAll("circle")
                        .attr("style", function (node) {
                            var color = "white";
                            if (node && node.context && node.context.resolution) {
                                switch (node.context.resolution.type) {
                                case "success": 
                                    color = "green"; 
                                    break;

                                case "failure": 
                                    color = "red"; 
                                    break;
                                }
                            }
                            return "stroke: gray; stroke-width: 2px; fill: " + color + ";";
                        });
                });

                // Restart the force layout.
                force.start();
            }

            // Make it all go
            update();
            this.update = update;
        }

        var queuedEvents = [],
            forceGraph,
            promises = [],
            idToPromise = {};

        function processEvent(event) {
            if (!queuedEvents) {
                switch (event.type) {
                case "promise":
                    promises.push(event);
                    idToPromise[event.id] = event;
                    forceGraph.addNode(event.id, event);
                    break;

                case "connection":
                    forceGraph.addLink(event.parentId, event.childId);
                    break;

                case "success":
                case "failure":
                    idToPromise[event.id].resolution = event;
                    forceGraph.update();
                    break;
                }
            } else {
                queuedEvents.push(event);
            }
        }

        function processQueuedEvents() {
            forceGraph = new ForceGraph("#" + graphParentName);
            queuedEvents.forEach(processEvent);
            queuedEvents = null;
        }

        watcher.addEventListener("promise", processEvent);
        watcher.addEventListener("connection", processEvent);
        watcher.addEventListener("success", processEvent);
        watcher.addEventListener("failure", processEvent);

        this.initializeAsync = processQueuedEvents;
    };

    root.PromiseInfoDisplay = function PromiseInfoDisplay(watcher, graphSelectionName) {
        var idToPromise = {};

        function processEvent(event) {
            switch (event.type) {
            case "promise":
                idToPromise[event.id] = event;
                break;

            case "success":
            case "failure":
                idToPromise[event.id].resolution = event;
                break;

            case "connection":
                idToPromise[event.childId].parentIds = (idToPromise[event.childId].parentIds || []).concat([event.parentId]);
                idToPromise[event.parentId].childIds = (idToPromise[event.parentId].childIds || []).concat([event.childId]);
                break;
            }
        }

        watcher.addEventListener("promise", processEvent);
        watcher.addEventListener("connection", processEvent);
        watcher.addEventListener("success", processEvent);
        watcher.addEventListener("failure", processEvent);

        this.initializeAsync = function() {
            watcher.addEventListener("selection", function (promiseId) {
                var promiseInfo = document.getElementById(graphSelectionName),
                    promiseContext = idToPromise[promiseId];

                function addEntry(list, name, value) {
                    var element = document.createElement("dt");
                    element.textContent = name;
                    list.appendChild(element);

                    element = document.createElement("dd");
                    element.appendChild(value);
                    list.appendChild(element);
                }

                function stringToSpan(value) {
                    var span = document.createElement("span");
                    span.textContent = "" + value;
                    return span;
                }

                function stringArrayToList(value) {
                    var ol = document.createElement("ol");
                    value.map(function (value) {
                        var li = document.createElement("li");
                        li.textContent = value;
                        return li;
                    }).forEach(function (li) {
                        ol.appendChild(li);
                    });
                    return ol;
                }

                function idsToSelectionLinks(value) {
                    var ol = document.createElement("ol");
                    value.map(function (value) {
                        var li = document.createElement("li");
                        li.textContent = value;
                        li.addEventListener("click", function () {
                            watcher.setSelectionId(value);
                        });
                        return li;
                    }).forEach(function (li) {
                        ol.appendChild(li);
                    });
                    return ol;
                }

                promiseInfo.innerHTML = "";
                addEntry(promiseInfo, "id", stringToSpan(promiseContext.id));
                addEntry(promiseInfo, "created", stringToSpan(promiseContext.date));
                addEntry(promiseInfo, "stack", stringArrayToList(promiseContext.stack));
                addEntry(promiseInfo, "resolved", stringToSpan(promiseContext.resolution && promiseContext.resolution.type || "pending"));
                addEntry(promiseInfo, "at", stringToSpan(promiseContext.resolution && promiseContext.resolution.date || "pending"));
                addEntry(promiseInfo, "stack", promiseContext.resolution && promiseContext.resolution.stack && stringArrayToList(promiseContext.resolution.stack) || stringToSpan("pending"));
                addEntry(promiseInfo, "parents", idsToSelectionLinks(promiseContext.parentIds || []));
                addEntry(promiseInfo, "children", idsToSelectionLinks(promiseContext.childIds || []));
            });
        };
    };

})(this);
