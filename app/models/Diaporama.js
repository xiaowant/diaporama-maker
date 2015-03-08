
var _ = require("lodash");
var Qajax = require("qajax");
var transitions = require("./transitions");

var toProjectUrl = require("../core/toProjectUrl");
var network = require("../core/network");
var genTimelineElementDefault = require("../../common/genTimelineElementDefault");

var recorderClient = require("diaporama-recorder/client")(network);

var Diaporama = {};

var newId = (function (i) { return function () { return ++i; }; }(0));

function assignIds (json) {
  if (json.timeline) {
    for (var i = 0; i < json.timeline.length; ++i) {
      json.timeline[i].id = newId();
    }
  }
  return json;
}

recorderClient.getFormats().subscribe(function (formats) {
  console.log(formats);
});

Diaporama.generateVideo = function (diaporama, options) {
  recorderClient.generateVideo(Diaporama.localize(diaporama, true), options);
};

Diaporama.generateHTML = function () {
  return Qajax({
    method: "POST",
    url: "/diaporama/generate/html"
  })
  .then(Qajax.filterSuccess);
};

Diaporama.bootstrap = function (options) {
  return Qajax({
    method: "POST",
    url: "/diaporama/bootstrap",
    data: options
  })
  .then(Qajax.filterSuccess)
  .then(Qajax.toJSON)
  .then(assignIds);
};

Diaporama.save = function (diaporama) {
  // TODO: replace with using network
  return Qajax({
    method: "POST",
    url: "/diaporama.json",
    data: Diaporama.inlineTransitions(Diaporama.clean(diaporama))
  })
  .then(Qajax.filterSuccess)
  .then(Qajax.toJSON);
};

Diaporama.fetch = function () {
  return Qajax({
    method: "GET",
    url: "/diaporama.json"
  })
  .then(Qajax.filterStatus(200))
  .then(Qajax.toJSON)
  .then(assignIds)
  .fail(function (maybeXhr) {
    if (maybeXhr && maybeXhr.status === 204) {
      return null; // recover No Content
    }
    throw maybeXhr;
  });
};

Diaporama.clean = function (diaporama) {
  var copy = Diaporama.inlineTransitions(_.cloneDeep(diaporama));
  if (copy.timeline) {
    for (var i = 0; i < copy.timeline.length; ++i) {
      delete copy.timeline[i].id;
    }
  }
  return copy;
};

Diaporama.timelineIndexOfId = function (diaporama, id) {
  var tl = diaporama.timeline;
  for (var i=0; i < tl.length; ++i)
    if (tl[i].id === id)
      return i;
  return -1;
};

Diaporama.timelineTimeIntervalForTransitionId = function (diaporama, id) {
  var tl = diaporama.timeline;
  var t = 0;
  for (var i=0; i < tl.length; ++i) {
    var el = tl[i];
    t += el.duration;
    var tnext = el.transitionNext;
    var tnextDuration = tnext && tnext.duration || 0;
    if (el.id === id) {
      return {
        start: t,
        end: t + tnextDuration
      };
    }
    t += tnextDuration;
  }
};
Diaporama.timelineTimeIntervalForId = function (diaporama, id) {
  var tl = diaporama.timeline;
  var t = 0;
  for (var i=0; i < tl.length; ++i) {
    var el = tl[i];
    if (el.id === id) {
      return {
        start: t,
        end: t + el.duration
      };
    }
    t += el.duration + (el.transitionNext && el.transitionNext.duration || 0);
  }
};
Diaporama.timelineTimeIntervalForItem = function (diaporama, item) {
  // TODO: ^ this should be the only method
  if (item.transition) {
    return Diaporama.timelineTimeIntervalForTransitionId(diaporama, item.id);
  }
  else {
    return Diaporama.timelineTimeIntervalForId(diaporama, item.id);
  }
};

Diaporama.timelineForId = function (diaporama, id) {
  return diaporama.timeline[Diaporama.timelineIndexOfId(diaporama, id)];
};

Diaporama.timelineTransitionForId = function (diaporama, id) {
  var i = Diaporama.timelineIndexOfId(diaporama, id);
  var from = diaporama.timeline[i];
  var to = diaporama.timeline[i+1 >= diaporama.timeline.length ? 0 : i+1];
  return {
    from: from,
    transitionNext: from.transitionNext,
    to: to
  };
};

Diaporama.lookupSegment = function (diaporama, time) {
  var tl = diaporama.timeline;
  var t = 0;
  for (var i=0; i < tl.length; ++i) {
    var item = tl[i];
    var duration = item.duration || 0;
    var tnext = item.transitionNext;
    var tnextDuration = tnext && tnext.duration || 0;

    if (t <= time && time <= t + duration) {
      return {
        id: item.id,
        transition: false
      };
    }

    t += duration;

    if (tnext) {
      if (t <= time && time <= t + tnextDuration) {
        return {
          id: item.id,
          transition: true
        };
      }
      t += tnextDuration;
    }
  }
  return null;
};

Diaporama.setTimelineElement = function (diaporama, id, element) {
  var clone = _.cloneDeep(diaporama);
  var index = Diaporama.timelineIndexOfId(clone, id);
  clone.timeline[index] = element;
  return clone;
};

Diaporama.setTransition = function (diaporama, id, transition) {
  var clone = _.cloneDeep(diaporama);
  var el = Diaporama.timelineForId(clone, id);
  el.transitionNext = transition;
  return clone;
};

Diaporama.bootstrapTransition = function (diaporama, id) {
                                                // vvv  TODO not supported diaporama.maker.defaultTransition  vvv
  return Diaporama.setTransition(diaporama, id, diaporama.maker && diaporama.maker.defaultTransition || {
    duration: 1000
  });
};

Diaporama.bootstrapImage = function (diaporama, src, afterId) {
  var clone = _.cloneDeep(diaporama);
  // vvv  TODO not supported diaporama.maker.defaultImage  vvv
  var obj = genTimelineElementDefault(src);
  obj.id = newId();
  if (afterId) {
    var index = Diaporama.timelineIndexOfId(clone, afterId) + 1;
    clone.timeline.splice(index, 0, obj);
  }
  else
    clone.timeline.push(obj);
  return {
    newItem: obj,
    diaporama: clone
  };
};


Diaporama._swapTimelineItemTransitions = function (clone, i, j) {
  var a = clone.timeline[i];
  var b = clone.timeline[j];
  var tmp = b.transitionNext;
  if (a.transitionNext) {
    b.transitionNext = a.transitionNext;
  }
  else {
    delete b.transitionNext;
  }
  if (tmp) {
    a.transitionNext = tmp;
  }
  else {
    delete a.transitionNext;
  }
  return clone;
};
Diaporama._swapTimelineItem = function (clone, i, j) {
  var tmp = clone.timeline[i];
  clone.timeline[i] = clone.timeline[j];
  clone.timeline[j] = tmp;
  return clone;
};

Diaporama.timelineRemoveItem = function (diaporama, item) {
  var index = Diaporama.timelineIndexOfId(diaporama, item.id);
  if (index === -1) return;
  var clone = _.cloneDeep(diaporama);
  if (item.transition)
    delete clone.timeline[index].transitionNext;
  else
    clone.timeline.splice(index, 1);
  return clone;
};

Diaporama.timelineMoveItemLeft = function (diaporama, item) {
  var index = Diaporama.timelineIndexOfId(diaporama, item.id);
  if (index === 0) return;
  var clone = _.cloneDeep(diaporama);
  Diaporama._swapTimelineItemTransitions(clone, index, index - 1);
  if (!item.transition) Diaporama._swapTimelineItem(clone, index, index - 1);
  return clone;
};

Diaporama.timelineMoveItemRight = function (diaporama, item) {
  var index = Diaporama.timelineIndexOfId(diaporama, item.id);
  if (index === diaporama.timeline.length-1) return;
  var clone = _.cloneDeep(diaporama);
  Diaporama._swapTimelineItemTransitions(clone, index, index + 1);
  if (!item.transition) Diaporama._swapTimelineItem(clone, index, index + 1);
  return clone;
};

Diaporama.inlineTransitions = function (diaporama) {
  var copy = _.clone(diaporama);
  var keys = {};
  for (var i = 0; i < copy.timeline.length; ++i) {
    var obj = copy.timeline[i];
    if (obj.transitionNext && obj.transitionNext.name) {
      keys[obj.transitionNext.name] = 1;
    }
  }
  copy.transitions = _.map(_.keys(keys), function (name) {
    return _.pick(transitions.byName(name), [ "glsl", "uniforms", "name" ]);
  });
  return copy;
};

Diaporama.localize = function (diaporama, fullSize) {
  if (!diaporama) return null;
  var clone = _.cloneDeep(diaporama);
  clone.timeline.forEach(function (item) {
    item.image = toProjectUrl(item.image, fullSize);
  });
  return clone;
};

module.exports = Diaporama;
