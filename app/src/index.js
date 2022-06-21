import "../css/base.css";
import "../css/diff.css";
import "../css/app.css";

import $ from "jquery";

import { forEach, isObject, every, filter } from "min-dash";

import BpmnViewer from "bpmn-js/lib/NavigatedViewer";

import { diff } from "bpmn-js-differ";

function createViewer(side) {
  return new BpmnViewer({
    container: "#canvas-" + side,
    height: "100%",
    width: "100%",
    canvas: {
      deferUpdate: false
    }
  });
}

function syncViewers(a, b) {
  var changing;

  function update(viewer) {
    return function (e) {
      if (changing) {
        return;
      }

      changing = true;
      viewer.get("canvas").viewbox(e.viewbox);
      changing = false;
    };
  }

  function syncViewbox(a, b) {
    a.on("canvas.viewbox.changed", update(b));
  }

  syncViewbox(a, b);
  syncViewbox(b, a);
}

function createViewers(left, right) {
  var sides = {};

  sides[left] = createViewer(left);
  sides[right] = createViewer(right);

  // sync navigation
  syncViewers(sides[left], sides[right]);

  return sides;
}

const viewers = createViewers("left", "right");

function getViewer(side) {
  return viewers[side];
}

function isLoaded(v) {
  return v.loading === false;
}

function allDiagramsLoaded() {
  return every(viewers, isLoaded);
}

function setLoading(viewer, loading) {
  viewer.loading = loading;
}

function clearDiffs(viewer) {
  viewer.get("overlays").remove({ type: "diff" });

  // TODO(nre): expose as external API
  forEach(viewer.get("elementRegistry")._elements, function (container) {
    var gfx = container.gfx,
      secondaryGfx = container.secondaryGfx;

    $(secondaryGfx || gfx)
      .removeClass("diff-added")
      .removeClass("diff-changed")
      .removeClass("diff-removed")
      .removeClass("diff-layout-changed");
  });
}

function diagramLoading(side, viewer) {
  setLoading(viewer, true);

  var loaded = filter(viewers, isLoaded);

  // clear diffs on loaded
  forEach(loaded, clearDiffs);
}

function diagramLoaded(err, side, viewer) {
  if (err) {
    console.error("load error", err);
  }

  setLoading(viewer, err || false);

  if (allDiagramsLoaded()) {
    // sync viewboxes
    var other = getViewer(side === "left" ? "right" : "left");
    viewer.get("canvas").viewbox(other.get("canvas").viewbox());

    showDiff(getViewer("left"), getViewer("right"));
  }
}

// we use $.ajax to load the diagram.
// make sure you run the application via web-server (ie. connect (node) or asdf (ruby))

function loadDiagram(side, diagram) {
  var viewer = getViewer(side);

  function done(err) {
    diagramLoaded(err, side, viewer);
  }

  diagramLoading(side, viewer);

  if (diagram.xml) {
    return viewer.importXML(diagram.xml, done);
  }

  $.get(diagram.url, function (xml) {
    viewer.importXML(xml, done);
  });
}

function showDiff(viewerOld, viewerNew) {
  var result = diff(viewerOld.getDefinitions(), viewerNew.getDefinitions());

  forEach(viewers, clearDiffs);

  $.each(result._removed, function (i, obj) {
    highlight(viewerOld, i, "diff-removed");
    addMarker(viewerOld, i, "marker-removed", "&minus;");
  });

  $.each(result._added, function (i, obj) {
    highlight(viewerNew, i, "diff-added");
    addMarker(viewerNew, i, "marker-added", "&#43;");
  });

  $.each(result._layoutChanged, function (i, obj) {
    highlight(viewerOld, i, "diff-layout-changed");
    addMarker(viewerOld, i, "marker-layout-changed", "&#8680;");

    highlight(viewerNew, i, "diff-layout-changed");
    addMarker(viewerNew, i, "marker-layout-changed", "&#8680;");
  });

  function prettyPrint(obj) {
    return JSON.stringify(obj, null, "  ").replace(/"/g, "&quot;");
  }

  $.each(result._changed, function (i, obj) {
    highlight(viewerOld, i, "diff-changed");
    addMarker(viewerOld, i, "marker-changed", "&#9998;");

    highlight(viewerNew, i, "diff-changed");
    addMarker(viewerNew, i, "marker-changed", "&#9998;");

    var details = "<table><tr><th>Attribute</th><th>old</th><th>new</th></tr>";
    $.each(obj.attrs, function (attr, changes) {
      details =
        details +
        "<tr>" +
        "<td>" +
        attr +
        "</td>" +
        "<td " +
        (isObject(changes.oldValue)
          ? 'title="' + prettyPrint(changes.oldValue) + '"'
          : "") +
        ">" +
        changes.oldValue +
        "</td>" +
        "<td " +
        (isObject(changes.newValue)
          ? 'title="' + prettyPrint(changes.newValue) + '"'
          : "") +
        ">" +
        changes.newValue +
        "</td>" +
        "</tr>";
    });

    details = details + "</table></div>";

    viewerOld
      .get("elementRegistry")
      .getGraphics(i)
      .addEventListener("click", function (event) {
        $("#changeDetailsOld_" + i).toggle();
      });

    var detailsOld =
      '<div id="changeDetailsOld_' + i + '" class="changeDetails">' + details;

    // attach an overlay to a node
    viewerOld.get("overlays").add(i, "diff", {
      position: {
        bottom: -5,
        left: 0
      },
      html: detailsOld
    });

    $("#changeDetailsOld_" + i).toggle();

    viewerNew
      .get("elementRegistry")
      .getGraphics(i)
      .addEventListener("click", function (event) {
        $("#changeDetailsNew_" + i).toggle();
      });

    var detailsNew =
      '<div id="changeDetailsNew_' + i + '" class="changeDetails">' + details;

    // attach an overlay to a node
    viewerNew.get("overlays").add(i, "diff", {
      position: {
        bottom: -5,
        left: 0
      },
      html: detailsNew
    });

    $("#changeDetailsNew_" + i).toggle();
  });

  // create Table Overview of Changes
  showChangesOverview(result, viewerOld, viewerNew);
}

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

if(urlParams.has('old'))
{
	loadDiagram("left", { url: urlParams.get('old') });
}

if(urlParams.has('new'))
{
	loadDiagram("right", { url: urlParams.get('new') });
}

function openDiagram(xml, side) {
  loadDiagram(side, { xml: xml });
}

function openFile(file, target, done) {
  var reader = new FileReader();

  reader.onload = function (e) {
    var xml = e.target.result;
    done(xml, target);
  };

  reader.readAsText(file);
}

$(".drop-zone").each(function () {
  var node = this,
    element = $(node);

  element.append('<div class="drop-marker" />');

  function removeMarker() {
    $(".drop-zone").removeClass("dropping");
  }

  function handleFileSelect(e) {
    e.stopPropagation();
    e.preventDefault();

    var files = e.dataTransfer.files;
    openFile(files[0], element.attr("target"), openDiagram);

    removeMarker();
  }

  function handleDragOver(e) {
    removeMarker();

    e.stopPropagation();
    e.preventDefault();

    element.addClass("dropping");

    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(e) {
    removeMarker();
  }

  node.addEventListener("dragover", handleDragOver, false);
  node.ownerDocument.body.addEventListener("dragover", handleDragLeave, false);

  node.addEventListener("drop", handleFileSelect, false);
});

$(".file").on("change", function (e) {
  openFile(e.target.files[0], $(this).attr("target"), openDiagram);
});

function addMarker(viewer, elementId, className, symbol) {
  var overlays = viewer.get("overlays");

  try {
    // attach an overlay to a node
    overlays.add(elementId, "diff", {
      position: {
        top: -12,
        right: 12
      },
      html: '<span class="marker ' + className + '">' + symbol + "</span>"
    });
  } catch (e) {
    // fuck you, haha
  }
}

function highlight(viewer, elementId, marker) {
  viewer.get("canvas").addMarker(elementId, marker);
}

function unhighlight(viewer, elementId, marker) {
  viewer.get("canvas").removeMarker(elementId, marker);
}

$("#changes-overview .show-hide-toggle").click(function () {
  $("#changes-overview").toggleClass("collapsed");
});

function showChangesOverview(result, viewerOld, viewerNew) {
  $("#changes-overview table").remove();

  var changesTable = $(
    "<table>" +
      "<thead><tr><th>#</th><th>Name</th><th>Type</th><th>Change</th></tr></thead>" +
      "</table>"
  );

  var count = 0;

  function addRow(element, type, label) {
    var html =
      '<tr class="entry">' +
      "<td>" +
      count++ +
      "</td><td>" +
      (element.name || "") +
      "</td>" +
      "<td>" +
      element.$type.replace("bpmn:", "") +
      "</td>" +
      '<td><span class="status">' +
      label +
      "</span></td>" +
      "</tr>";

    $(html)
      .data({
        changed: type,
        element: element.id
      })
      .addClass(type)
      .appendTo(changesTable);
  }

  $.each(result._removed, function (i, obj) {
    addRow(obj, "removed", "Removed");
  });

  $.each(result._added, function (i, obj) {
    addRow(obj, "added", "Added");
  });

  $.each(result._changed, function (i, obj) {
    addRow(obj.model, "changed", "Changed");
  });

  $.each(result._layoutChanged, function (i, obj) {
    addRow(obj, "layout-changed", "Layout Changed");
  });

  changesTable.appendTo("#changes-overview .changes");

  var HIGHLIGHT_CLS = "highlight";

  $("#changes-overview tr.entry").each(function () {
    var row = $(this);

    var id = row.data("element");
    var changed = row.data("changed");

    row.hover(
      function () {
        if (changed === "removed") {
          highlight(viewerOld, id, HIGHLIGHT_CLS);
        } else if (changed === "added") {
          highlight(viewerNew, id, HIGHLIGHT_CLS);
        } else {
          highlight(viewerOld, id, HIGHLIGHT_CLS);
          highlight(viewerNew, id, HIGHLIGHT_CLS);
        }
      },
      function () {
        if (changed === "removed") {
          unhighlight(viewerOld, id, HIGHLIGHT_CLS);
        } else if (changed === "added") {
          unhighlight(viewerNew, id, HIGHLIGHT_CLS);
        } else {
          unhighlight(viewerOld, id, HIGHLIGHT_CLS);
          unhighlight(viewerNew, id, HIGHLIGHT_CLS);
        }
      }
    );

    row.click(function () {
      var containerWidth = $(".di-container").width();
      var containerHeight = $(".di-container").height();

      var viewer = changed === "removed" ? viewerOld : viewerNew;

      var element = viewer.get("elementRegistry").get(id);

      var x, y;

      if (element === viewer.get("canvas").getRootElement()) {
        x = containerWidth / 2;
        y = containerHeight / 2 - 100;
      } else if (element.waypoints) {
        x = element.waypoints[0].x;
        y = element.waypoints[0].y;
      } else {
        x = element.x + element.width / 2;
        y = element.y + element.height / 2;
      }

      viewer.get("canvas").viewbox({
        x: x - containerWidth / 2,
        y: y - (containerHeight / 2 - 100),
        width: containerWidth,
        height: containerHeight
      });
    });
  });
}

$("body").removeClass("preload");
