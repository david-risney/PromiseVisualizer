(function (root) {
    "use strict";

    function Watcher() {
        var nextId = (function () {
            var id = 0;
            return function () { return id++; }
        })();

        var eventTarget = new EventTarget(this, ["promise", "connection", "success", "failure", "progress"]);

        function setPromiseId(promise, id) { promise.promiseVisualizerId = id; }
        function getPromiseId(promise) { return promise.promiseVisualizerId; }

        function getCurrentStack() {
            var stack = "";
            try {
                throw new Error();
            } catch (e) {
                stack = e.stack.split("\n");
                stack.splice(0, 1);
                stack = stack.filter(function (line) { return line.indexOf("/promiseVisualizer.js:") === -1; });
            }
            return stack;
        }

        function wrapThen(promise, parents) {
            var originalThen = promise.then.bind(promise),
                id = nextId();

            parents = parents || [];

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

            setPromiseId(promise, id);

            eventTarget.dispatchPromiseEvent(createEventArgument("promise"));
            parents.forEach(function (parent) {
                eventTarget.dispatchConnectionEvent(createEventArgument("connection", { parentId: getPromiseId(parent), childId: id }));
            });

            originalThen(function (value) {
                eventTarget.dispatchSuccessEvent(createEventArgument("success", { value: value }));
            }, function (value) {
                eventTarget.dispatchFailureEvent(createEventArgument("failure", { value: value }));
            }, function (value) {
                eventTarget.dispatchProgressEvent(createEventArgument("progress", { value: value }));
            });

            promise.then = function (successCallback, failureCallback, progressCallback) {
                return wrapThen(originalThen(successCallback, failureCallback, progressCallback), [ promise ]);
            };

            return promise;
        }

        this.watch = wrapThen;
    }

    function ConsoleVisualizer(watcher, console) {
        watcher = watcher || new Watcher();
        console = console || root.console;

        this.watch = watcher.watch.bind(watcher);

        ["promise", "connection", "success", "failure", "progress"].forEach(function (eventName) {
            watcher.addEventListener(eventName, function (eventArgument) {
                console.log(eventArgument.type + "(" + eventArgument.id + "): " + JSON.stringify(eventArgument));
            });
        });
    }

    function ForceGraph(el) {
        function fillPromiseInfo(promiseContext) {
            function addEntry(list, name, value) {
                var element = document.createElement("dt");
                element.textContent = name;
                list.appendChild(element);
                element = document.createElement("dd");
                if (typeof(value) === "string" || value.length === undefined) {
                    element.textContent = value;
                } else {
                    var ol = document.createElement("ol");
                    value.map(function (value) {
                        var li = document.createElement("li");
                        li.textContent = value;
                        return li;
                    }).forEach(function (li) {
                        ol.appendChild(li);
                    });
                    element.appendChild(ol);
                }
                list.appendChild(element);
            }
            var promiseInfo = document.getElementById("promiseInfo");
            if (!promiseInfo) {
                promiseInfo = document.createElement("dl");
                promiseInfo.setAttribute("id", "promiseInfo");
                document.getElementById("graphParent").appendChild(promiseInfo);
            }
            promiseInfo.innerHTML = "";
            addEntry(promiseInfo, "id", promiseContext.id);
            addEntry(promiseInfo, "created", promiseContext.date);
            addEntry(promiseInfo, "stack", promiseContext.stack);
            addEntry(promiseInfo, "resolved", promiseContext.resolution && promiseContext.resolution.type || "pending");
            addEntry(promiseInfo, "at", promiseContext.resolution && promiseContext.resolution.date || "pending");
            addEntry(promiseInfo, "stack", promiseContext.resolution && promiseContext.resolution.stack || "pending");
        }

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
                .attr("class", "link");

            link.exit().remove();

            var node = vis.selectAll("g.node")
                .data(nodes, function(d) { return d.id;});

            var nodeEnter = node.enter().append("g")
                .attr("class", "node")
                .on("click", function (node) { fillPromiseInfo(node.context); })
                .call(force.drag);

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

    function D3Visualizer(watcher, graphParentName) {
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
            forceGraph = new ForceGraph(graphParentName || "#graphParent");
            queuedEvents.forEach(processEvent);
            queuedEvents = null;
        }

        watcher.addEventListener("promise", processEvent);
        watcher.addEventListener("connection", processEvent);
        watcher.addEventListener("success", processEvent);
        watcher.addEventListener("failure", processEvent);

        this.initializeAsync = processQueuedEvents;
    }

    root.ConsoleVisualizer = ConsoleVisualizer;
    root.D3Visualizer = D3Visualizer;
    root.Watcher = Watcher;

})(this);
