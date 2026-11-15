---
title: "Blockchain short reports"
date: 2020-09-24
permalink: "/blockchain-short-reports-2/"
layout: base.njk
sourceUrl: "https://utopiacap.com/blockchain-short-reports-2/"
archivedAt: "20200924201017"
---
# Blockchain Short Reports

<p>We have been publishing short reports since August 2019. The structure of these reports and the red flags raised can be considered a &ldquo;rough outline&rdquo; of the methodology our community uses to determine whether a stock&rsquo;s price is likely to experience a considerable decrease in value in the short run. Precise timing is a must, so all of our short calls (short reports and trade alerts) have been timestamped with blockchain technology since February 2020 &mdash; proof of the precision of our short calls.</p>

<p><a class="btn-readmore" href="/track-record/">Track record</a></p>

<p>The research and trading strategy behind the tickers featured in our short reports is discussed extensively in our premium chat service, hours or days ahead of publication. This gives our members time to analyze our research, carry out their own due diligence, and discuss trading strategy with other community members.</p>

<div class="pub-grid">
  {% for post in collections["short-report"] | reverse %}
  <a class="pub-card" href="{{ post.url }}">
    {% set cover = post.data.coverImage or (post.templateContent | firstImageSrc) %}
    <div class="pub-card-image"{% if cover %} style="background-image: url('{{ cover }}');"{% endif %}></div>
    <div class="pub-card-body">
      <h3>{{ post.data.title }}</h3>
      <time datetime="{{ post.date | isoDate }}">{{ post.date | postDate }}</time>
    </div>
  </a>
  {% endfor %}
</div>
