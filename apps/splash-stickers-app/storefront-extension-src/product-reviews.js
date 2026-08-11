(function () {
  'use strict';

  if (window.SplashProductReviews) return;

  function proxyBase(node) {
    return node && node.dataset && node.dataset.proxyBase || '/apps/splash-stickers/';
  }

  async function request(node, path, options) {
    var response = await fetch(proxyBase(node) + path, Object.assign({
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
    }, options || {}));
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var message = payload.error && payload.error.message ? payload.error.message : 'Request failed.';
      throw new Error(message);
    }
    return payload;
  }

  function renderReviews(root, payload) {
    var summary = root.querySelector('[data-review-summary]');
    var list = root.querySelector('[data-review-list]');
    var count = payload.summary ? payload.summary.count : 0;
    var average = payload.summary ? payload.summary.average : 0;
    summary.textContent = count ? average + '/5 · ' + count + ' review' + (count === 1 ? '' : 's') : 'No reviews yet';
    list.replaceChildren();
    (payload.reviews || []).forEach(function (review) {
      var article = document.createElement('article');
      article.className = 'splash-review';
      var title = document.createElement('h3');
      title.className = 'splash-review__title';
      title.textContent = review.rating + '/5 · ' + (review.title || 'Review');
      var body = document.createElement('p');
      body.className = 'splash-review__body';
      body.textContent = review.body;
      var meta = document.createElement('p');
      meta.className = 'splash-review__meta';
      meta.textContent = (review.authorName || 'Customer') + (review.verified ? ' · Verified' : '');
      article.append(title, body, meta);
      list.append(article);
    });
  }

  function initReviews(root) {
    var productId = root.dataset.productId;
    if (!productId) return;
    request(root, 'reviews?product_id=' + encodeURIComponent(productId))
      .then(function (payload) { renderReviews(root, payload); })
      .catch(function () {
        root.querySelector('[data-review-summary]').textContent = 'Reviews unavailable.';
      });

    var form = root.querySelector('[data-review-form]');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var status = form.querySelector('[data-review-form-status]');
      var data = new FormData(form);
      status.textContent = 'Submitting…';
      request(root, 'reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId: productId,
          rating: Number(data.get('rating')),
          authorName: data.get('authorName'),
          title: data.get('title'),
          body: data.get('body')
        })
      }).then(function () {
        form.reset();
        status.textContent = 'Thank you. Review submitted for moderation.';
      }).catch(function (error) {
        status.textContent = error.message;
      });
    });
  }

  function initialize() {
    document.querySelectorAll('[data-splash-reviews]').forEach(initReviews);
  }

  window.SplashProductReviews = { initialize: initialize };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}());
