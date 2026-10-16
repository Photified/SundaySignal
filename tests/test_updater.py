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

class ConsensusSourceTests(unittest.TestCase):
 def test_cbs_named_metadata_and_team(self):
  import json
  cfg=json.dumps({'marketName':'Spread','meta':{'bets':[{'expertLabel':'Test Analyst'}]}})
  parser=u.CBSRows();parser.feed('<table><tr><td><a href="/nfl/gametracker/preview/NFL_20261018_CHI@ATL/">Game</a></td><td><button data-config=\''+cfg+'\'><div>ATL +3.5</div><span>Remove</span></button></td></tr></table>')
  self.assertEqual(parser.rows[0]['picks'],[('Test Analyst','Falcons +3.5')])
 def test_cover_table_team_is_explicit(self):
  parser=u.TableCells();parser.feed('<table><tr><td>Falcons vs Bears</td><td><img alt="Falcons">+3.5</td></tr></table>')
  self.assertEqual(parser.rows[0][1]['images'],['Falcons']);self.assertEqual(parser.rows[0][1]['text'],'+3.5')
 def test_parlay_retains_original_legs_and_combined_price(self):
  content='<h3>Falcons at Bears</h3><p>Leg 1: Falcons +3.5 (-110)</p><p>Leg 2: Over 44.5 (-110)</p><p>Parlay Odds: +250</p>'
  parlay=u.extract_parlays(content)[0];self.assertEqual(parlay['americanOdds'],250);self.assertEqual(len(parlay['legs']),2);self.assertEqual(parlay['legs'][0]['context'],'Falcons at Bears')
 def test_incomplete_parlay_is_not_invented(self):
  self.assertEqual(u.extract_parlays('<p>Leg 1: Falcons +3.5</p><p>Leg 3: Over 44.5</p><p>Parlay Odds: +250</p>'),[])
 def test_event_matching_requires_unambiguous_week(self):
  article={'title':'NFL Week 6 picks','publishedAt':'2026-10-16T12:00:00+00:00'}
  game={'id':'1','startAt':'2026-10-18T17:00Z','teams':['Bears','Falcons'],'week':6,'state':'pre'}
  self.assertEqual(u.match_event({'selection':'Falcons +3.5','context':''},article,[game]),game)
  self.assertIsNone(u.match_event({'selection':'Falcons +3.5','context':''},{**article,'title':'NFL Week 7 picks'},[game]))
  self.assertIsNone(u.match_event({'selection':'Falcons +3.5','context':''},{**article,'title':'NFL picks'},[game]))

class PublisherTests(unittest.TestCase):
 def test_sbr_selected_column_not_matchup_favorite(self):
  raw='<table><tr><td>Panthers vs Eagles (-1.5)</td><td>Panthers (+1.5)</td></tr></table>'
  self.assertEqual(u.publisher_selections(raw,'sbr')[0]['selection'],'Panthers +1.5')
 def test_sportingnews_ats_not_predicted_winner(self):
  raw='<h3>Cardinals (+12.5, 51.5 o/u) at Rams</h3><p>Pick: Rams win 31-20 but fail to cover the spread.</p>'
  self.assertEqual(u.publisher_selections(raw,'sportingnews')[0]['selection'],'Cardinals +12.5')
 def test_sportingnews_requires_pick_statement(self):
  self.assertEqual(u.publisher_selections('<h3>Cardinals (+12.5) at Rams</h3>','sportingnews'),[])
 def test_sportschat_explicit_free_pick(self):
  self.assertEqual(u.publisher_selections("<h2>Andrew's Free Pick: Green Bay Packers -1.5</h2>",'sportschat')[0]['selection'],'Green Bay Packers -1.5')
