---
title: "Blockchain Trade Alerts"
date: 2020-05-14
permalink: "/blockchain-trade-alerts/"
layout: base.njk
sourceUrl: "https://utopiacap.com/blockchain-trade-alerts/"
archivedAt: "20200514004735"
---
# Blockchain Trade Alerts

<h4 data-fontsize="18" data-lineheight="19"><strong>As part of Utopia’s mission to find truth on Wall Street we are proud to have launched the world’s first “impossible to manipulate” blockchain timestamped and verified Trade Alerts. </strong><strong>You can now verify to the second when a new Trade Alert is published and the price of stock at that specific point in time. </strong><strong>The blockchain timestamps are proof of the time of publishing and content of these articles as explained below.</strong></h4>
<h4 data-fontsize="18" data-lineheight="19"><span style="text-decoration: underline;"><strong>What are blockchain timestamps?</strong></span></h4>
<h4><strong>Our content is timestamped with WordProof Timestamp, which is why you might see a notification that looks like this on some of our pages:</strong></h4>
<div class="imageframe-align-center"><span class="fusion-imageframe imageframe-none imageframe-1 hover-type-none"><img src="/wp-content/uploads/2020/05/Wordproof-blockchain-timestamp.png" width="895" height="57" alt="" title="Wordproof blockchain timestamp" class="img-responsive wp-image-3720"></span></div>
<h4><strong>Because of this, you (as a visitor) can verify that what we wrote and published is actually shown on the webpage: it is impossible for us (or anyone else) to tamper with the information. For each page, a fingerprint is generated (the hash), which is added to a blockchain transaction. Because of the immutability of the blockchain, this transaction (and the fingerprint) can’t be modified or removed. Thus, you know for sure (and can verify yourself) that our content was written at the indicated time.</strong></h4>
<h4 data-fontsize="18" data-lineheight="19"><strong>If you are not familiar with Blockchain you can <a href="https://www.investopedia.com/terms/b/blockchain.asp" target="_blank" rel="noopener noreferrer"><span style="text-decoration: underline;"><span style="color: #339966; text-decoration: underline;">read the details here</span></span></a>.</strong></h4>

<div class="pub-grid">
  {% for post in collections["trade-alert"] | reverse %}
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
