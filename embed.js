(function (global) {
    // utilities
    /*
 flatstache.js - Logic-less, section-less templates in JavaScript. Expands simple (flat) Mustache templates.
 (c) 2011 Nathan Vander Wilt and Aaron McCall. MIT license.
*/
    var mustache = (function(){
        var _re3 = /{{{\s*(\w+)\s*}}}/g,
            _re2 = /{{\s*(\w+)\s*}}/g,
            _re1 = /[&\"'<>\\]/g,  // "
            _escape_map = {"&": "&amp;", "\\": "&#92;", "\"": "&quot;", "'": "&#39;", "<": "&lt;", ">": "&gt;"},
            _escapeHTML = function(s) {
                return s.replace(_re1, function(c) { return _escape_map[c]; });
            };
        return function (template, data) {
            return template
                .replace(_re3, function (m, key) { return data[key] != null ? data[key] : ""; })
                .replace(_re2, function (m, key) { return data[key] != null ? _escapeHTML(data[key]) : ""; });
        };
    })();
    var __slice = Array.prototype.slice.call.bind(Array.prototype.slice);
    function defer(fn) {
        return function () {
            setTimeout.apply(null, [fn, 1].concat(__slice(arguments)));
        };
    }
    // noEmbed is a free-to-use oembed wrapper
    var noEmbedURL = 'https://noembed.com/';
    function noEmbedEmbedURL(url) {
        return noEmbedURL + 'embed?url=' + encodeURIComponent(url);
    }
    var noEmbedProviders;
    // init noEmbed providers
    $.getJSON(noEmbedURL + 'providers', function (data) {
        if (Array.isArray(data)) {
            noEmbedProviders = [];
            data.forEach(function (provider) {
                if (noEmbedOverrides[provider.name] && noEmbedOverrides[provider.name].noMatch) {
                    return;
                }
                if (Array.isArray(provider.patterns)) {
                    var patterns = provider.patterns.map(function (pattern) {
                        return new RegExp(pattern.replace('http:', 'https?:'));
                    });
                    provider.patterns = patterns;
                }
                noEmbedProviders.push(provider);
            });
        }
    });

    var noEmbedOverrides = {
        Twitter: {
            endpoint: function (match) {
                if (match[1]) {
                    return 'https://api.twitter.com/1/statuses/oembed.json?omit_script=true?id=' + match[1].trim();
                }
                return '';
            },
            processor: function (element, data) {
                var html = $(data.html);
                html.find('script').remove();
                html.prepend(mustache('<strong>From {{ provider_name }}</strong>', data));
                data.html = '<blockquote>' + html.html() + '</blockquote>';
                oembed(element, data);
            }
        },
        Rdio: {
            endpoint: function (match) {
                return 'http://www.rdio.com/api/oembed/?format=json&url=' + match[0];
            },
            patterns: [
                /^https?:\/\/rd\.io.*$/
            ],
            processor: function (element, data) {
                if (element.href) {
                    data.provider_url = element.href;
                    if (element.href.length > 50) {
                        data.provider_url = element.href.substr(0, 50) + '\u2026';
                    }
                }
                data.html = mustache(
                    '<blockquote>' +
                    '<span class="embed-title">{{ provider_name }} <br><small>({{ provider_url }})</small></span>' +
                    '<img src="{{ thumbnail_url }}">' +
                    '</blockquote>',
                    data
                );
                oembed(element, data);
            }
        },
        "Github Commit": {
            processor: function (element, data) {
                var html = $(data.html);
                html.find('table').remove();
                html.find('a[href]').each(function (i, el) {
                    $(el).replaceWith($('<span>').text(el.textContent).attr('class', el.className));
                });
                data.html = '<blockquote>' + html.html() + '</blockquote>';
                oembed(element, data);
            }
        }
    };

    function oembedScan(href) {
        var provider = scanOverrides(href);
        if (!provider) provider = scanNoEmbed(href);
        return provider;
    }

    function scanOverrides(href) {
        var oName, override;
        for (oName in noEmbedOverrides) {
            override = noEmbedOverrides[oName];
            if (!override.patterns) {
                // No override URL patterns to check
                continue;
            }
            match = testPatterns(href, override.patterns);
            if (match) {
                var payload = { url: href };
                if (override.endpoint) payload.url = override.endpoint(match);
                if (override.processor) payload.processor = override.processor;
                return payload;
            }
        }
        return null;
    }

    function scanNoEmbed(href) {
        var match, override, provider;
        var i = 0;
        var l = noEmbedProviders.length;
        for (; i < l; i++) {
            provider = noEmbedProviders[i];
            match = testPatterns(href, provider.patterns);
            if (match) {
                payload = {};
                if ((override = noEmbedOverrides[provider.name])) {
                    if (override.endpoint) payload.url = override.endpoint(match);
                    if (override.processor) payload.processor = override.processor;
                }
                if (!payload.url) payload.url = noEmbedEmbedURL(href);
                return payload;
            }
        }
        return null;
    }

    function testPatterns(href, patterns) {
        if (!patterns) return null;
        for (var i = 0, l = patterns.length, pattern; i < l; i++) {
            pattern = patterns[i];
            if (pattern.test(href)) return href.match(pattern);
        }
        return null;
    }

    var linkProcessor = defer(function (i, link) {
        var provider = oembedScan(link.href);
        if (provider) {
            return $.getJSON(provider.url, function (data) {
                if (data.error) {
                    return $.get(link.href, responseProcessor.bind(null, link));
                }
                (provider.processor || oembed)(link, data);
            });
        }
        $.get(link.href, responseProcessor.bind(null, link));
    });

    function responseProcessor(link, response, y, xhr) {
        var mime = xhr.getResponseHeader('Content-Type');
        if (mime.match(/^image/)) {
            return embedImage(link, link.href);
        } else if (mime.match(/(html|xml)/)) {
            if (response.indexOf('property="og:') > -1) {
                return opengraph(link, response);
            }
            if (response.indexOf('application/json+oembed') > -1) {
                return oembedDiscovery(link, response);
            }
            var title = response.match(/<title[^>]*>(.*)<\/title>/);
            if (title && title[1] && link.href.indexOf(title[1].trim().toLowerCase()) === -1) {
                link.textContent = [link.textContent, title[1]].join(' \u2014 ');
            }
        }
        
    }

    function processLinks(element) {
        $('a[href]', element).each(linkProcessor);
    }

    function embedImage(element, url, title) {
        var html = '';
        if (url) {
            if (title) html += '<span class="embed-title">' + title + '</span>';
            html += '<img src="' + url + '" alt="' + title + '">';
            element.innerHTML = html;
            element.classList.add('embed');
            element.classList.add('embed-image');
        }
    }

    function embedVideo(element, url, title) {
        embedImage(element, url, title);
        element.classList.remove('embed-image');
        element.classList.add('embed-video');
    }

    var ogPatterns = {};

    function extractOpengraph(response, prop, namespace) {
        if (!namespace) namespace = 'og';
        var pattern = ogPatterns[prop];
        if (!pattern) {
            pattern = ogPatterns[prop] = new RegExp("<meta[^>]+property=[\"']" + namespace + ":" + prop + "[\"'][^>]*>");
        }
        var match = response.match(pattern);
        if (match) {
            var content = match[0].match(/content=["']([^"]+)["']/);
            if (content && content[1]) return content[1].trim();
        }
        return '';
    }

    function opengraph(element, response) {
        var og = {};
        ['image', 'title', 'description', 'type', 'site_name'].forEach(function (prop) {
            og[prop] = extractOpengraph(response, prop);
        });
        if ((!og.type && og.image) || og.type.indexOf('photo') > -1 || og.type.indexOf('image') > -1) {
            return embedImage(element, og.image, og.title);
        }

        if (og.type === 'video') {
            return embedVideo(element, og.image, og.title);
        }

        if (og.type === 'article') {
            og.author = extractOpengraph(response, 'author', 'article');
        }

        var embed = [];
        if (og.title) {
            if (og.site_name) {
                og.title =  og.site_name + ': ' + og.title;
            }
            if (og.author) {
                og.title += ' by\u00A0' + og.author.split('/').pop();
            }
            embed.push('<span class="embed-title">' + og.title + '</span>');
        }
        if (og.description && og.description !== og.title) {
            if (og.description.length > 50) {
                og.description = og.description.split(/(\.?!)/).slice(0, 2).join('');
                if (og.description > 50) {
                    og.description = og.description.substr(0, 50) + '\u2026';
                }
            }
            embed.push('<span class="embed-description">' + og.description + '</span>');
        }
        if (og.image) {
            embed.push('<img src="' + og.image + '">');
            element.classList.add('embed-rich');
        }
        element.classList.add('embed');
        element.classList.add('opengraph');
        element.innerHTML = '<blockquote>' + embed.join(' ') + '</blockquote>';

     }

    var oembedTypeHandlers = {
        photo: function (element, oembed) {
            embedImage(element, oembed.url, oembed.title);
        },
        rich: function (element, oembed) {
            if (!oembed.html) return;
            if (oembed.html.indexOf('<blockquote') === -1) {
                oembed.html = '<blockquote>' + oembed.html + '</blockquote>';
            }
            var embed = $(oembed.html.split('<script').shift());
            if (element.hasChildNodes()) {
                while (element.firstChild) element.removeChild(element.firstChild);
            }
            element.appendChild(embed[0]);
            element.classList.add('embed');
            element.classList.add('embed-rich');
        },
        video: function (element, oembed) {
            var title = (oembed.provider_name ? (oembed.provider_name + ': ') : '') + oembed.title;
            embedVideo(element, oembed.thumbnail_url, title);
        }
    };

    function oembed(element, data) {
        if (data && data.type && oembedTypeHandlers[data.type]) {
            oembedTypeHandlers[data.type](element, data);
        }
    }

    function oembedDiscovery(element, response) {
        var links = response.match(/<link[^>]+>/g);
        if (links && links.length) {
            var oembeds = links.filter(function (theLink) {
                return theLink.indexOf('application\/json+oembed') > -1;
            });
            if (oembeds.length) {
                var url = oembeds[0].match(/href="([^"]+)"/);
                if (url && url.length > 1 && url[1].match(/^http/)) {
                    $.getJSON(url[1], oembed.bind(null, element));
                }
            }
        }
    }


    global.embed = {
        processLinks: processLinks
    };
})(this);