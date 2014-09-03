(function (global) {
    // utilities
    var ELLIPSIS = '\u2026';
    var NBSP = '\u00A0';
    var LONGDASH = '\u2014';
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

        function render(template, data) {
            return template
                .replace(_re3, function (m, key) { return data[key] != null ? data[key] : ""; })
                .replace(_re2, function (m, key) { return data[key] != null ? _escapeHTML(data[key]) : ""; });
        }

        return function (template, data) {
            if (arguments.length === 1) {
                return function (data) {
                    return render(template, data);
                };
            }
            return render(template, data);
        };
    })();
    var __slice = Array.prototype.slice.call.bind(Array.prototype.slice);
    function defer(fn) {
        return function () {
            setTimeout.apply(null, [fn, 1].concat(__slice(arguments)));
        };
    }
    var punctOrphanPattern = /([!\?\.])( \w+)(\u2026)$/;
    function deOrphan(str) {
        if (punctOrphanPattern.test(str)) {
            return str.replace(punctOrphanPattern, '$1');
        }
        return str;
    }

    function formatTitle (title, length) {
        length = parseInt(length, 10) || 75;
        var shortLength = length - parseInt(length * 0.333, 10);
        if (title.length > length) {
            var pieces = [title];
            var lastBy = title.lastIndexOf('by');
            if (lastBy !== -1) {
                console.log('found last "by" at %d', lastBy);
                pieces = [title.slice(0, lastBy - 1), title.slice(lastBy)];
                console.log('title pieces: %o', pieces);
            }
            pieces[0] = pieces[0].slice(0, (pieces.length > 1 ? shortLength : length));
            if (pieces[0].length === (pieces.length > 1 ? shortLength : length)) {
                console.log('pieces[0] is at full length');
                pieces[0] = pieces[0].split(' ').slice(0, -1).join(' ') + ELLIPSIS;
            }
            return pieces.join('');
        }
        return deOrphan(title);
    }

    function formatDescription(description, length) {
        length = parseInt(length, 10) || 75;
        if (description.length > length) {
            description = description.slice(0, length).split(' ').slice(0, -1).join(' ') + ELLIPSIS;
        }
        return deOrphan(description);
    }
    // noEmbed is a free-to-use oembed wrapper
    var noEmbedURL = 'https://noembed.com/';
    function noEmbedEmbedURL(url) {
        return noEmbedURL + 'embed?url=' + encodeURIComponent(url);
    }
    var noEmbedProviders = [];
    var lastInitNE;
    // init noEmbed providers
    function initNoEmbed() {
        if (lastInitNE && (Date.now() - lastInitNE < (1000 * 60 * 5))) {
            return;
        }
        var promise = $.getJSON(noEmbedURL + 'providers', function (data) {
            if (Array.isArray(data)) {
                data.forEach(function (provider) {
                    if (embedOverrides[provider.name] && embedOverrides[provider.name].noMatch) {
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
                lastInitNE = Date.now();
            }
        });
    }

    var embedOverrides = {
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
                if (element.href && !data.provider_url) {
                    data.provider_url = element.href;
                }
                data.html = mustache(
                    '<p class="embed-title">{{ provider_name }}</p>' +
                    '<p class="embed-description">{{ provider_url }}</p>' +
                    '<img src="{{ thumbnail_url }}">' +
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
                data.html = blockquote(html.html());
                oembed(element, data);
            }
        },
        "Github General": {
            patterns: [
                /^https?:\/\/github.com\/?$/,
                /^https?:\/\/github.com\/[^\/]+\/[^\/]+\/(?!commit)\w*\/.*$/,
                /^https?:\/\/github.com\/[^\/]+\/?[^\/]*$/
            ],
            endpoint: function (match) { return match[0]; },
            opengraph_template: mustache(blockquote([
                '<img class="avatar" src="{{ image }}">',
                embedTitle('{{ title }}'),
                embedDescription('{{ description }}')
            ].join("\n"))),
            processor: function (element, doc) {
                console.log("Github General processor called");
                return opengraph(element, doc, this.opengraph_template);
            },
            json: false
        },
        Hackpad: {
            patterns: [ /^https?:\/\/[^\.]*\.?hackpad.com.*$/ ],
            endpoint: function () { return null; }
        }
    };
    function oembedScan(href) {
        var provider = scanOverrides(href);
        if (!provider) provider = scanNoEmbed(href);
        return provider;
    }

    function scanOverrides(href) {
        var oName, override;
        for (oName in embedOverrides) {
            override = embedOverrides[oName];
            if (!override.patterns) {
                // No override URL patterns to check
                continue;
            }
            match = testPatterns(href, override.patterns);
            if (match) {
                console.log('override %s matched %s', oName, href);
                var payload = { url: href };
                if (override.endpoint) payload.url = override.endpoint(match);
                if (override.processor) payload.processor = override.processor.bind(override);
                    payload.meta = override;
                return payload;
            }
        }
        return null;
    }

    function scanNoEmbed(href) {
        var match, override, provider;
        var i = 0;
        var l = noEmbedProviders.length;
        if (l === 0) {
            return initNoEmbed(scanNoEmbed.bind(null, href));
        }
        for (; i < l; i++) {
            provider = noEmbedProviders[i];
            match = testPatterns(href, provider.patterns);
            if (match) {
                payload = {};
                if ((override = embedOverrides[provider.name])) {
                    if (override.endpoint) payload.url = override.endpoint(match);
                    if (override.processor) payload.processor = override.processor.bind(override);
                    payload.meta = override;
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
        if (link.href.match(/\.(jpg|png|gif)$/)) {
            return embedImage(link);
        }
        var provider = oembedScan(link.href);
        if (provider) {
            console.log('provider:', provider);
            if (provider.url !== null) {
                return $[(provider.meta.json === false ? 'get' : 'getJSON')](provider.url, function (data) {
                    if (data.error) {
                        return $.get(link.href, responseProcessor.bind(null, link));
                    }
                    (provider.processor || oembed)(link, data);
                }).fail(function () {
                    console.log('provider.url failed');
                    $.get(link.href, responseProcessor.bind(null, link));
                });
            } else {
                // There is an override in place that intentionally prevents processing this link.
                return;
            }
        }
        $.get(link.href, responseProcessor.bind(null, link));
    });

    function responseProcessor(link, response, y, xhr) {
        var mime = xhr.getResponseHeader('Content-Type');
        if (!mime || !response) return;
        if (mime.match(/^image/)) {
            return embedImage(link, link.href);
        } else if (mime.match(/(html|xml)/)) {
            if (response.indexOf('property="og:') > -1) {
                return opengraph(link, response);
            }
            if (response.indexOf('application/json+oembed') > -1) {
                return oembedDiscovery(link, response);
            }
            defaultProcessor(link, response);
        }
        
        
    }

    function defaultProcessor(element, response) {
        var title = response.match(/<title[^>]*>(.*)<\/title>/);
        var embed = [];
        if (title && title[1] && element.href.indexOf(title[1].trim().toLowerCase()) === -1) {
            embed.push(embedTitle(title[1], 75, {span: true}));
        }
        var description = extractOpengraph(response, 'description', '');
        if (description) {
            embed.push(embedDescription(description, 300, {span: true}));
        }
        if (embed.length) {
            element.innerHTML = element.textContent + ' \u2014 ' + embed.join(': ');
        }
    }

    function processLinks(element) {
        $('a[href]', element).each(linkProcessor);
    }

    function blockquote(str) {
        return '<blockquote>' + str + '</blockquote>';
    }

    function embedTitle(title, length, options) {
        var tagName = 'p';
        if (options && options.span) {
            tagName = 'span';
        }
        return '<' + tagName + ' class="embed-title">' + formatTitle(title, length) + '</' + tagName + '>';
    }

    function embedDescription(description, length, options) {
        var tagName = 'p';
        if (options && options.span) {
            tagName = 'span';
        }
        return '<' + tagName + ' class="embed-description">' + formatDescription(description, length) + '</' + tagName + '>';
    }

    function embedImage(element, url, title) {
        var html = '';
        if (!url && element.href.match(/\.(jpg|png|gif)$/)) {
            url = element.href;
        }
        if (url && url.indexOf('http') !== -1) {
            if (title) html += embedTitle(title);
            if (!url.match(/\/(blank|empty|transparent)\.(jpg|png|gif)/)) {
                html += '<img src="' + url + '" alt="' + title + '">';
            }
            element.innerHTML = element.textContent + html;
            if (!element.classList.contains('embed')) element.classList.add('embed');
        }
    }

    function embedVideo(element, url, title) {
        embedImage(element, url, title);
        element.classList.add('embed-video');
    }

    var ogPatterns = {};

    function extractOpengraph(response, prop, namespace) {
        namespace = (namespace != null) ? namespace : 'og';
        var name;
        if (!namespace) name = prop;
        if (!name) name = [namespace, prop].join(':');
        console.log('extractOpengraph is looking for %s in response', name);
        var pattern = ogPatterns[prop];
        if (!pattern) {
            pattern = ogPatterns[prop] = new RegExp("<meta[^>]+(property|name)=[\"']" + name + "[\"'][^>]*>");
        }
        console.log('pattern is %s', pattern);
        var match = response.match(pattern);
        console.log('match is', match);
        if (match) {
            var content = match[0].match(/content=["']([^"]+)["']/);
            console.log('content is', content);
            if (content && content[1]) return content[1].trim();
        }
        return '';
    }

    function opengraph(link, response, template) {
        var og = {};
        var propCount = 0;
        ['image', 'title', 'description', 'type', 'site_name'].forEach(function (prop) {
            og[prop] = extractOpengraph(response, prop);
            if (og[prop]) propCount++;
        });

        if (propCount) {
            link.classList.add('embed');
            link.classList.add('opengraph');
        }

        if (template) {
            console.log('Rendering into template: %s', template, og);
            link.innerHTML = link.textContent + template(og);
            return;
        }

        if (!og.description) og.description = extractOpengraph(response, 'description', '');
        if ((!og.type && og.image  && propCount === 1) || og.type.indexOf('photo') > -1 || og.type.indexOf('image') > -1) {
            return embedImage(link, og.image, og.title);
        }

        if (og.type === 'video') {
            return embedVideo(link, og.image, og.title);
        }

        if (og.type === 'article') {
            og.author = extractOpengraph(response, 'author', 'article');
        }
        var embed = [];
        if (og.title) {
            if (og.site_name && og.title.indexOf(og.site_name) === -1) {
                og.title =  og.site_name + ': ' + og.title;
            }
            if (og.author) {
                var author = og.author.split('?').shift().replace(/\/$/, '').split('/').pop();
                og.title += ' by\u00A0' + author;
            }
            embed.push(embedTitle(og.title));
        }
        if (og.description && og.description !== og.title && og.description !== link.href) {
            embed.push(embedDescription(og.description));
        }
        if (og.image && !og.image.match(/blank\.(jpg|png|gif)/)) {
            embed.push('<img src="' + og.image + '">');
        }
        link.innerHTML = link.textContent + blockquote(embed.join(' '));

     }

    var oembedTypeHandlers = {
        photo: function (element, oembed) {
            embedImage(element, oembed.url, oembed.title);
        },
        rich: function (element, oembed) {
            if (!oembed.html) return;
            if (oembed.html.indexOf('<blockquote') === -1) {
                oembed.html = blockquote(oembed.html);
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
    initNoEmbed();
    global.embed = {
        processLinks: processLinks
    };
})(this);