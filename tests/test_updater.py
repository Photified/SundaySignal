import datetime as dt
import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('updater',Path(__file__).resolve().parents[1]/'scripts/update_picks.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
class PicksTests(unittest.TestCase):
 def test_not_inferred_from_prose_or_odds_table(self):
  self.assertEqual(u.selections('<p>The Falcons are +3.5 but we like their opponent.</p><table><tr><td>Falcons +3.5</td></tr></table>'),[])
 def test_explicit_pick(self):
  picks=u.selections('<p><strong>Pick: Falcons +3.5</strong></p>');self.assertEqual(picks[0]['selection'],'Falcons +3.5')
 def test_totals_keep_matchup_context(self):
  p=u.selections('<h3>Falcons vs Saints O/U Pick</h3><p>Pick: Over 42.5</p>')[0];self.assertEqual(p['context'],'Falcons vs Saints');self.assertEqual(p['market'],'Totals')
 def test_duplicate_heading_and_label(self):
  p=u.selections('<h3>NFL ATS Pick #1: Falcons +3.5 vs Saints</h3><p>NFL Week 6 Pick: Falcons +3.5</p>');self.assertEqual(len(p),1)
 def test_market(self):
  self.assertEqual(u.market('Falcons to Win vs Saints'),'Moneyline')
  self.assertEqual(u.market('Kirk Cousins Under 0.5 Interceptions'),'Props')
 def test_teaser_not_misrepresented_as_standard_spread(self):
  self.assertEqual(u.selections('<h3>Falcons (+8.5 to +14.5) vs Saints</h3>'),[])
 def test_only_recent_nfl(self):
  raw=b'''<rss xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item><title>NFL Falcons Picks</title><link>https://example.com/nfl</link><dc:creator>Test Analyst</dc:creator><pubDate>Fri, 16 Oct 2026 12:00:00 GMT</pubDate><description>&lt;h3&gt;Falcons +3.5&lt;/h3&gt;</description></item><item><title>NBA Picks</title><link>https://example.com/nba</link><pubDate>Fri, 16 Oct 2026 12:00:00 GMT</pubDate></item><item><title>NFL old picks</title><link>https://example.com/old</link><pubDate>Wed, 16 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>'''
  a=u.parse_feed(raw,{'id':'test','name':'Test'},dt.datetime(2026,10,16,15,tzinfo=dt.timezone.utc));self.assertEqual(len(a),1);self.assertEqual(a[0]['author'],'Test Analyst');self.assertEqual(a[0]['teams'],['Falcons'])
 def test_failed_source_retains_cached_articles_and_timestamp(self):
  now=dt.datetime(2026,10,16,15,tzinfo=dt.timezone.utc)
  source={'id':'test','name':'Test','feed':'https://example.com/feed','website':'https://example.com'}
  old={'sources':[{'id':'test','lastSuccessAt':'2026-10-16T12:00:00+00:00'}], 'articles':[{'sourceId':'test','publishedAt':'2026-10-15T12:00:00+00:00','id':'kept'},{'sourceId':'test','publishedAt':'2026-09-15T12:00:00+00:00','id':'expired'}]}
  with patch.object(u.urllib.request,'urlopen',side_effect=OSError('network failure')),patch.object(u.time,'sleep'):
   articles,status=u.fetch_source(source,now,old)
  self.assertEqual([a['id'] for a in articles],['kept']);self.assertEqual(status['status'],'unavailable');self.assertEqual(status['lastSuccessAt'],'2026-10-16T12:00:00+00:00')
 def test_no_promotional_heading(self):
  self.assertEqual(u.selections('<h3>Bonus: Falcons +3.5 promo code</h3>'),[])
if __name__=='__main__':unittest.main()
