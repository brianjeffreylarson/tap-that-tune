#!/usr/bin/env python3
"""
Build canonical-duration lookup and flag mismatches.

Canonical durations (seconds) are based on the radio/album version
most likely featured on Name That Tune US — the version the average
listener would recognize from a snippet.

For songs where canonical is unknown, we set canonical = actual
so they won't be flagged (low-confidence pass-through).
"""

import json
import csv
from pathlib import Path

TRACKS_DIR = Path("/sessions/cool-vibrant-thompson/mnt/tracks")
OUTPUT_CSV = Path("/sessions/cool-vibrant-thompson/mnt/outputs/full_canonical_check.csv")

# Canonical durations in seconds.
# Key = (artist, title) lowercased & stripped.
# Sources: my recollection / common knowledge of these recordings.
# Format: "artist::title": seconds
CANONICAL = {
    # ====== ALREADY KNOWN-WRONG (from Brian's list) ======
    "michael jackson::smooth criminal": 257,        # album 4:17 (file has 2:43 radio)
    "will smith::the fresh prince of bel-air theme": 175,  # full TV theme ~2:55
    "crosby, stills & nash::suite: judy blue eyes": 444,   # album 7:25 (file 0:40)
    "bastille::pompeii": 211,                       # album 3:31 (file 0:55)
    "billie eilish::therefore i am": 174,           # 2:54 (file 1:02)
    "roy orbison::oh, pretty woman": 175,           # 2:55 (file 1:45)
    "fugees::killing me softly with his song": 298, # 4:58 (file 2:04)
    "cyndi lauper::time after time": 238,           # 3:58 (file 1:56)
    "anita ward::ring my bell": 213,                # album 3:33 (file 8:12)
    "jennifer lopez feat. pitbull::on the floor": 230,  # radio edit 3:50 (file 5:32)
    "olivia newton-john::physical": 217,            # album 3:37 (file is 3:13 - WRONG, file is Dua Lipa Physical instead of Olivia)

    # ====== CLASSIC ROCK / POP I'M CONFIDENT ABOUT ======
    "queen::bohemian rhapsody": 355,
    "led zeppelin::stairway to heaven": 482,
    "eagles::hotel california": 391,
    "don mclean::american pie": 516,
    "prince::purple rain": 524,
    "lynyrd skynyrd::sweet home alabama": 284,
    "guns n' roses::sweet child o' mine": 355,
    "journey::don't stop believin'": 251,
    "bon jovi::livin' on a prayer": 249,
    "ac/dc::back in black": 255,
    "ac/dc::you shook me all night long": 210,
    "the eagles::hotel california": 391,
    "boston::more than a feeling": 280,
    "fleetwood mac::go your own way": 223,
    "fleetwood mac::dreams": 257,
    "fleetwood mac::the chain": 270,
    "fleetwood mac::don't stop": 193,
    "the beatles::hey jude": 431,                   # album 7:11. File 238.9s = 3:59 is the rarely-used radio edit. Most people recognize the full 7:11 version. FLAG.
    "the beatles::let it be": 243,
    "the beatles::here comes the sun": 185,
    "the beatles::come together": 259,
    "the beatles::twist and shout": 156,
    "the beatles::all you need is love": 230,
    "the beatles::i want to hold your hand": 145,
    "the beatles::ob-la-di, ob-la-da": 188,         # 3:08 album (file 147 = 2:27 short - FLAG, possibly cover)
    "the beatles::something": 183,
    "the beatles::get back": 189,
    "the beatles::i saw her standing there": 175,   # album 2:55 (file 4:17 = likely live/cover version, FLAG)
    "the beatles::oh! darling": 207,

    # ====== MICHAEL JACKSON ======
    "michael jackson::thriller": 358,
    "michael jackson::billie jean": 294,
    "michael jackson::beat it": 258,
    "michael jackson::don't stop 'til you get enough": 364,
    "michael jackson::man in the mirror": 322,
    "michael jackson::rock with you": 220,
    "michael jackson::wanna be startin' somethin'": 363,
    "michael jackson::p.y.t. (pretty young thing)": 239,

    # ====== ABBA / DISCO / 70S ======
    "abba::dancing queen": 230,
    "abba::mamma mia": 213,
    "bee gees::stayin' alive": 285,
    "bee gees::night fever": 213,
    "bee gees::how deep is your love": 245,
    "bee gees::tragedy": 303,
    "bee gees::more than a woman": 196,
    "bee gees::to love somebody": 181,
    "bee gees::how can you mend a broken heart": 238,
    "donna summer::hot stuff": 226,                 # 3:46 album (file 5:15 = 12-inch dance version, FLAG)
    "donna summer::bad girls": 295,
    "donna summer::last dance": 296,                # The famous version IS the 4:56 album cut with the slow intro that ramps up. FILE OK.
    "donna summer::macarthur park": 244,            # single 4:04. File 234 = 3:54 close. Original disco album is 8:43 but radio plays single edit.
    "chic::le freak": 257,                          # album 4:17 is standard.
    "sister sledge::we are family": 217,
    "sister sledge::he's the greatest dancer": 375, # album 6:15 OK
    "earth, wind & fire::september": 215,
    "earth, wind & fire with the emotions::boogie wonderland": 288,
    "earth, wind & fire::let's groove": 339,
    "earth, wind & fire::shining star": 170,
    "kc and the sunshine band::that's the way (i like it)": 185,
    "kc and the sunshine band::get down tonight": 196,  # album 3:16 (file 5:20 = 12-inch dance mix — too long for snippet game, FLAG)
    "kc and the sunshine band::(shake, shake, shake) shake your booty": 187,
    "the sugarhill gang::rapper's delight": 446,    # 7-inch single 7:26 (file 7:08 close enough). 14:54 LP rarely played on radio.
    "village people::y.m.c.a.": 287,                # 4:47
    "gloria gaynor::i will survive": 296,           # The 4:56 version with full intro is the iconic one. FILE matches.
    "anita ward::ring my bell": 213,
    "frankie goes to hollywood::two tribes": 232,   # single 3:52 is the radio hit (file 6:17 = 12-inch extended, FLAG)
    "frankie goes to hollywood::relax": 234,        # single 3:54 OK

    # ====== 80S / NEW WAVE ======
    "a-ha::take on me": 225,
    "a-ha::the sun always shines on t.v.": 302,
    "tears for fears::shout": 394,                  # album 6:34
    "tears for fears::everybody wants to rule the world": 251,
    "tears for fears::head over heels": 255,
    "duran duran::hungry like the wolf": 220,
    "duran duran::rio": 337,
    "duran duran::girls on film": 207,              # 7" single is 3:30, album is 5:30. File 207s = 3:27 OK
    "duran duran::the reflex": 213,                 # 3:33 single edit standard.
    "the human league::don't you want me": 237,
    "soft cell::tainted love": 154,                 # 7" single 2:34
    "soft cell::say hello, wave goodbye": 220,      # single 3:40 is radio version. File 213 close.
    "culture club::karma chameleon": 252,
    "culture club::do you really want to hurt me": 263,
    "culture club::church of the poison mind": 209,
    "billy idol::white wedding": 252,
    "billy idol::rebel yell": 287,
    "billy idol::eyes without a face": 297,
    "pat benatar::heartbreaker": 207,
    "pat benatar::hit me with your best shot": 172,
    "pat benatar::we belong": 222,
    "pat benatar::love is a battlefield": 251,      # 4:11 single edit is the radio version. File 249 close.
    "the police::every breath you take": 254,
    "the police::roxanne": 191,
    "the police::message in a bottle": 290,
    "the police::don't stand so close to me": 242,
    "the police::every little thing she does is magic": 261,
    "the police::walking on the moon": 301,
    "the bangles::manic monday": 185,
    "the bangles::eternal flame": 235,
    "the bangles::walk like an egyptian": 205,
    "wham!::wake me up before you go-go": 232,
    "wham!::last christmas": 273,                   # full 6:42 album, but the common version is the 4:23 single
    "george michael::careless whisper": 312,        # album 6:32 (file 5:00 - this is the radio edit, common)
    "george michael::father figure": 336,
    "george michael::faith": 192,
    "george michael::one more try": 351,
    "george michael::kissing a fool": 275,
    "daryl hall & john oates::maneater": 296,       # 4:56 album standard.
    "daryl hall & john oates::out of touch": 263,
    "daryl hall & john oates::private eyes": 217,
    "daryl hall & john oates::kiss on my list": 265,
    "daryl hall & john oates::rich girl": 145,
    "daryl hall & john oates::i can't go for that (no can do)": 307,
    "daryl hall & john oates::you make my dreams": 191,
    "pet shop boys::west end girls": 285,
    "pet shop boys::it's a sin": 301,
    "spandau ballet::true": 393,                    # album 6:33
    "spandau ballet::gold": 234,
    "phil collins::in the air tonight": 336,
    "phil collins::another day in paradise": 323,
    "phil collins::sussudio": 263,                  # 4:23 album standard.
    "phil collins::you'll be in my heart": 258,
    "genesis::invisible touch": 208,
    "genesis::i can't dance": 240,
    "genesis::that's all": 264,
    "kate bush::running up that hill (a deal with god)": 300,
    "kate bush::wuthering heights": 269,
    "nena::99 luftballons": 233,
    "falco::rock me amadeus": 202,
    "dexys midnight runners::come on eileen": 287,
    "haddaway::what is love": 270,
    "snap!::the power": 220,                        # 3:39 radio single (file 5:44 = 12-inch extended, FLAG)
    "technotronic::pump up the jam": 320,           # 12-inch 5:20 (file matches)
    "deee-lite::groove is in the heart": 232,
    "robin s.::show me love": 254,                  # 4:14 single edit (file matches).

    # ====== 90S ======
    "nirvana::smells like teen spirit": 301,
    "nirvana::come as you are": 219,
    "nirvana::heart-shaped box": 281,
    "nirvana::something in the way": 232,
    "pearl jam::black": 343,
    "pearl jam::alive": 340,
    "pearl jam::jeremy": 319,
    "pearl jam::daughter": 235,
    "soundgarden::black hole sun": 320,
    "the smashing pumpkins::bullet with butterfly wings": 258,
    "the smashing pumpkins::disarm": 197,
    "stone temple pilots::plush": 313,
    "stone temple pilots::interstate love song": 195,
    "stone temple pilots::vasoline": 177,
    "the cranberries::zombie": 308,
    "the cranberries::dreams": 271,
    "the cranberries::linger": 274,
    "radiohead::creep": 238,
    "radiohead::fake plastic trees": 290,
    "oasis::wonderwall": 258,
    "oasis::champagne supernova": 450,
    "oasis::don't look back in anger": 289,
    "blur": None,
    "weezer::say it ain't so": 258,
    "weezer::hash pipe": 186,
    "blink-182::all the small things": 167,
    "green day::basket case": 181,
    "green day::good riddance (time of your life)": 153,
    "green day::american idiot": 174,
    "green day::wake me up when september ends": 285,
    "green day::boulevard of broken dreams": 260,
    "green day::holiday": 232,
    "no doubt::don't speak": 263,
    "no doubt::just a girl": 209,
    "no doubt::spiderwebs": 268,
    "spice girls::wannabe": 173,
    "spice girls::2 become 1": 245,                 # 4:05 (file matches).
    "spice girls::say you'll be there": 235,
    "spice girls::who do you think you are": 235,
    "spice girls::spice up your life": 173,
    "*nsync::bye bye bye": 200,
    "*nsync::it's gonna be me": 191,
    "*nsync::tearin' up my heart": 209,
    "*nsync::this i promise you": 280,
    "*nsync::gone": 316,                            # 5:16 file matches Spanglish remix or extended version, accept.
    "backstreet boys::i want it that way": 213,
    "backstreet boys::everybody (backstreet's back)": 225,
    "backstreet boys::as long as you love me": 214,
    "backstreet boys::larger than life": 232,
    "backstreet boys::shape of my heart": 230,
    "backstreet boys::quit playing games (with my heart)": 232,
    "britney spears::...baby one more time": 211,
    "britney spears::oops!...i did it again": 213,
    "britney spears::toxic": 199,
    "britney spears::(you drive me) crazy": 199,
    "britney spears::lucky": 205,
    "britney spears::i'm not a girl, not yet a woman": 230,
    "britney spears::gimme more": 251,
    "britney spears::piece of me": 212,
    "britney spears::womanizer": 224,
    "ricky martin::livin' la vida loca": 243,
    "ricky martin::she bangs": 280,
    "tlc::no scrubs": 215,
    "tlc::waterfalls": 285,
    "tlc::unpretty": 280,
    "destiny's child": None,
    "alanis morissette::ironic": 230,
    "alanis morissette::you oughta know": 248,
    "alanis morissette::hand in my pocket": 222,
    "alanis morissette::all i really want": 277,
    "alanis morissette::head over feet": 268,
    "natalie imbruglia::torn": 245,
    "celine dion::my heart will go on": 280,
    "celine dion::all by myself": 312,
    "celine dion::beauty and the beast": 246,
    "celine dion::because you loved me": 274,
    "celine dion::the power of love": 343,
    "celine dion::it's all coming back to me now": 457,
    "celine dion::to love you more": 279,
    "whitney houston::i will always love you": 271,
    "whitney houston::i wanna dance with somebody (who loves me)": 291,
    "whitney houston::greatest love of all": 297,
    "whitney houston::how will i know": 269,
    "whitney houston::i'm every woman": 285,
    "whitney houston::saving all my love for you": 237,
    "whitney houston::exhale (shoop shoop)": 205,
    "whitney houston::so emotional": 277,
    "whitney houston::i have nothing": 290,
    "mariah carey::all i want for christmas is you": 241,
    "mariah carey::always be my baby": 258,
    "mariah carey::fantasy": 243,
    "mariah carey::hero": 258,
    "mariah carey::dreamlover": 234,
    "mariah carey::emotions": 248,
    "mariah carey::we belong together": 201,
    "mariah carey::someday": 246,                   # 4:06 standard (file 3:28 short - FLAG)
    "alanis morissette::ironic": 230,
    "tom petty::free fallin'": 256,
    "tom petty::i won't back down": 178,
    "tom petty and the heartbreakers::american girl": 215,
    "tom petty and the heartbreakers::mary jane's last dance": 273,
    "tom petty and the heartbreakers::don't do me like that": 162,
    "blind melon::no rain": 217,
    "third eye blind::semi-charmed life": 268,
    "third eye blind::jumper": 273,
    "third eye blind::how's it going to be": 253,
    "third eye blind::motorcycle drive by": 263,
    "counting crows::mr. jones": 272,
    "the wallflowers::one headlight": 313,
    "live::lightning crashes": 326,
    "matchbox twenty::push": 239,
    "matchbox twenty::bent": 248,
    "matchbox twenty::unwell": 229,
    "foo fighters::everlong": 250,
    "foo fighters::learn to fly": 235,
    "foo fighters::all my life": 331,
    "foo fighters::best of you": 257,
    "foo fighters::the pretender": 269,
    "foo fighters::times like these": 202,          # 3:22 single edit is the radio version. File matches.
    "foo fighters::big me": 133,
    "red hot chili peppers::californication": 330,
    "red hot chili peppers::scar tissue": 216,
    "red hot chili peppers::under the bridge": 264,
    "red hot chili peppers::give it away": 283,
    "bush::glycerine": 266,
    "bush::machinehead": 256,
    "eve 6::inside out": 220,
    "eve 6::here's to the night": 254,
    "the verve::bitter sweet symphony": 357,
    "the verve pipe::the freshmen": 270,
    "incubus::drive": 233,
    "incubus::stellar": 200,
    "incubus::anna molly": 225,
    "modest mouse::float on": 208,
    "ace of base::the sign": 191,
    "ace of base::all that she wants": 211,
    "ace of base::beautiful life": 220,
    "the cardigans::lovefool": 194,
    "the cardigans::my favourite game": 220,

    # ====== HIP-HOP / R&B ======
    "outkast::hey ya!": 235,
    "outkast::ms. jackson": 270,
    "outkast::roses": 228,                          # radio single edit 3:48. File matches.
    "outkast feat. sleepy brown::the way you move": 234,
    "nelly::hot in herre": 228,
    "nelly feat. kelly rowland::dilemma": 289,
    "nelly::ride wit me": 296,
    "usher::yeah!": 250,                            # file shows usher feat lil jon ludacris
    "usher feat. lil jon & ludacris::yeah!": 250,
    "usher::burn": 232,
    "usher::confessions part ii": 211,
    "usher::u got it bad": 248,
    "rihanna::umbrella": 278,
    "rihanna::disturbia": 239,
    "rihanna::don't stop the music": 269,
    "rihanna::s.o.s.": 240,                         # 4:00 (file 249 close)
    "rihanna::pon de replay": 247,
    "rihanna::only girl (in the world)": 235,
    "rihanna::we found love": 215,
    "rihanna feat. drake::work": 219,
    "rihanna::needed me": 192,
    "rihanna::love on the brain": 224,
    "rihanna feat. jay-z::umbrella": 278,
    "beyoncé feat. jay-z::crazy in love": 236,
    "beyoncé::halo": 261,
    "beyoncé::single ladies (put a ring on it)": 193,
    "beyoncé::irreplaceable": 228,
    "beyoncé & shakira::beautiful liar": 201,
    "salt-n-pepa::push it": 273,                    # 4:33 album standard. File matches.
    "salt-n-pepa::let's talk about sex": 282,
    "run-dmc & aerosmith::walk this way": 230,      # 3:50 radio edit is the iconic version. File 219 close.
    "run-dmc::it's like that": 207,                 # Jason Nevins remix is 3:30, the famous radio version. File 203 close.
    "vanilla ice::ice ice baby": 254,               # 4:14 is between radio 3:52 and album 4:31, accept as common variant.
    "coolio feat. l.v.::gangsta's paradise": 240,
    "fugees::ready or not": 203,                    # 3:23 radio edit. File matches.
    "boyz ii men::end of the road": 351,
    "boyz ii men::i'll make love to you": 237,
    "boyz ii men::on bended knee": 332,
    "boyz ii men::motownphilly": 235,
    "all-4-one::i swear": 260,
    "tlc::no scrubs": 215,
    "drake::hotline bling": 267,
    "drake feat. rihanna::take care": 277,          # 4:37 standard.
    "drake feat. wizkid & kyla::one dance": 173,
    "post malone::circles": 215,
    "post malone feat. 21 savage::rockstar": 218,
    "post malone::chemical": 184,
    "lil nas x feat. billy ray cyrus::old town road (remix)": 157,
    "lil nas x & jack harlow::industry baby": 212,
    "wiz khalifa feat. charlie puth::see you again": 230,
    "kendrick lamar": None,

    # ====== POP ======
    "taylor swift::shake it off": 219,
    "taylor swift::blank space": 232,
    "taylor swift::love story": 235,
    "taylor swift::you belong with me": 232,
    "taylor swift::bad blood": 199,                 # feat kendrick is 199, original is 211. File 199.8 OK
    "taylor swift feat. kendrick lamar::bad blood": 199,
    "taylor swift::we are never ever getting back together": 193,
    "taylor swift::out of the woods": 236,
    "taylor swift::cruel summer": 178,
    "taylor swift::anti-hero": 200,
    "taylor swift::style": 231,
    "taylor swift::cardigan": 239,
    "taylor swift::lover": 221,
    "katy perry::firework": 228,
    "katy perry::roar": 224,
    "katy perry::i kissed a girl": 180,
    "katy perry::teenage dream": 228,
    "katy perry::california gurls": 236,
    "katy perry feat. snoop dogg::california gurls": 236,
    "katy perry::hot n cold": 220,
    "katy perry::part of me": 215,
    "katy perry::dark horse": 215,
    "katy perry feat. juicy j::dark horse": 215,
    "katy perry::waking up in vegas": 198,
    "katy perry::last friday night (t.g.i.f.)": 230,
    "lady gaga::bad romance": 295,
    "lady gaga::poker face": 237,
    "lady gaga::just dance": 242,
    "lady gaga feat. colby o'donis::just dance": 242,
    "lady gaga::born this way": 260,
    "lady gaga::alejandro": 274,
    "lady gaga::applause": 212,
    "lady gaga::the edge of glory": 262,
    "lady gaga::marry the night": 264,
    "ariana grande::7 rings": 179,
    "ariana grande::thank u, next": 207,
    "ariana grande::break free": 215,
    "ariana grande feat. zedd::break free": 215,
    "ariana grande::problem": 196,
    "ariana grande feat. iggy azalea::problem": 196,
    "ariana grande::side to side": 226,
    "ariana grande feat. nicki minaj::side to side": 226,
    "ariana grande::no tears left to cry": 205,
    "ariana grande::dangerous woman": 236,
    "ariana grande::god is a woman": 197,
    "ariana grande::into you": 244,
    "ariana grande::one last time": 197,
    "dua lipa::don't start now": 183,
    "dua lipa::levitating": 203,
    "dua lipa::break my heart": 222,
    "dua lipa::houdini": 186,
    "billie eilish::bad guy": 194,
    "billie eilish::ocean eyes": 200,
    "billie eilish::happier than ever": 298,
    "billie eilish & khalid::lovely": 200,          # 3:20 official (file 4:25 — extended/instrumental version, FLAG)
    "billie eilish::what was i made for?": 222,
    "olivia rodrigo::drivers license": 242,
    "olivia rodrigo::good 4 u": 178,
    "olivia rodrigo::deja vu": 215,
    "olivia rodrigo::brutal": 143,                  # 2:23 standard. File matches.
    "olivia rodrigo::vampire": 220,
    "harry styles::adore you": 207,
    "harry styles::as it was": 167,
    "harry styles::watermelon sugar": 174,
    "harry styles::golden": 208,
    "the weeknd::blinding lights": 200,
    "the weeknd::save your tears": 215,
    "the weeknd & ariana grande::save your tears (remix)": 215,
    "the weeknd feat. daft punk::starboy": 230,
    "ed sheeran::shape of you": 234,
    "ed sheeran::perfect": 263,
    "ed sheeran::thinking out loud": 281,           # 4:41 album (file 276)
    "ed sheeran::photograph": 258,                  # 4:18 album (file 248 OK)
    "ed sheeran::castle on the hill": 261,
    "ed sheeran::shiver": 220,                      # 3:40 (file 179.8 = 2:59 ? Way too short - WRONG)
    "ed sheeran & justin beiber::i don't care": 220,
    "ed sheeran & justin bieber::i don't care": 220,
    "ed sheeran::galway girl": 171,
    "bruno mars::24k magic": 226,
    "bruno mars::just the way you are": 220,
    "bruno mars::grenade": 222,
    "bruno mars::the lazy song": 189,
    "bruno mars::marry you": 230,
    "bruno mars::when i was your man": 214,
    "bruno mars::locked out of heaven": 234,
    "bruno mars::finesse": 190,                     # 3:10 original album. File matches.
    "mark ronson feat. bruno mars::uptown funk": 270,
    "justin bieber::baby": 213,
    "justin bieber::sorry": 200,
    "justin bieber::love yourself": 233,
    "justin bieber feat. daniel caesar & giveon::peaches": 198,
    "justin bieber::ghost": 153,
    "justin bieber::boyfriend": 171,
    "justin bieber::what do you mean?": 206,
    "the chainsmokers feat. halsey::closer": 245,
    "the chainsmokers feat. daya::don't let me down": 208,
    "the chainsmokers & coldplay::something just like this": 248,
    "coldplay::clocks": 308,
    "coldplay::yellow": 269,
    "coldplay::viva la vida": 242,
    "coldplay::fix you": 295,
    "coldplay::the scientist": 309,
    "coldplay::in my place": 228,
    "coldplay::speed of sound": 288,
    "imagine dragons::believer": 204,
    "imagine dragons::radioactive": 187,
    "imagine dragons::thunder": 187,
    "imagine dragons::natural": 189,
    "imagine dragons::demons": 175,
    "maroon 5::sugar": 235,
    "maroon 5::moves like jagger": 200,
    "maroon 5 feat. christina aguilera::moves like jagger": 200,
    "maroon 5::animals": 231,
    "maroon 5::misery": 215,
    "maroon 5 feat. wiz khalifa::payphone": 232,    # 3:51 (file 231 - matches)
    "maroon 5 feat. cardi b::girls like you": 235,
    "carly rae jepsen::call me maybe": 193,
    "psy::gangnam style": 219,
    "smash mouth::all star": 200,
    "smash mouth::walkin' on the sun": 206,
    "shakira feat. wyclef jean::hips don't lie": 218,
    "shakira::whenever, wherever": 196,
    "shakira::she wolf": 188,
    "sia::cheap thrills": 224,                      # 3:44 (file 202 = 3:22, slightly short)
    "sia::chandelier": 216,
    "sia::elastic heart": 257,
    "sia feat. kendrick lamar::the greatest": 210,
    "adele::hello": 295,
    "adele::someone like you": 285,
    "adele::rolling in the deep": 228,
    "adele::set fire to the rain": 243,
    "adele::skyfall": 287,
    "adele::chasing pavements": 211,
    "sam smith::stay with me": 173,
    "sam smith::too good at goodbyes": 201,
    "sam smith & kim petras::unholy": 156,
    "sam smith::writing's on the wall": 286,
    "sam smith::lay me down": None,
    "the killers::mr. brightside": 223,
    "the killers::somebody told me": 197,           # 3:17 (file 201 close)
    "the killers::human": 245,                      # 4:05 standard (file 4:27 = longer, possible remix - FLAG borderline)
    "shawn mendes::stitches": 207,
    "shawn mendes::treat you better": 188,
    "shawn mendes::in my blood": 211,
    "twenty one pilots::stressed out": 202,
    "twenty one pilots::heathens": 196,
    "twenty one pilots::ride": 215,
    "twenty one pilots::tear in my heart": 188,
    "panic! at the disco::high hopes": 191,
    "panic! at the disco::i write sins not tragedies": 187,
    "panic! at the disco::this is gospel": 197,
    "panic! at the disco::nine in the afternoon": 192,
    "macklemore & ryan lewis feat. ray dalton::can't hold us": 258,
    "macklemore & ryan lewis feat. wanz::thrift shop": 235,  # 3:55 album (file 154 = 2:34 — too short. WRONG)
    "calvin harris & dua lipa::one kiss": 214,      # 3:34 standard (file 3:12 = 22s short, FLAG).
    "zedd feat. foxes::clarity": 271,
    "zedd, maren morris & grey::the middle": 184,   # 3:04 (file 166 = 2:46, close)
    "zedd feat. jon bellion::beautiful now": 219,
    "zedd feat. hayley williams::stay the night": 217,
    "avicii::wake me up": 247,
    "avicii::levels": 339,
    "doja cat feat. sza::kiss me more": 209,
    "doja cat::say so": 238,
    "doja cat::woman": 173,
    "doja cat::paint the town red": 231,
    "sza::kill bill": 154,
    "sza::good days": 279,
    "sza::snooze": 202,
    "lizzo::about damn time": 192,
    "miley cyrus::flowers": 200,                    # 3:20 (file 193 = 3:13 ok)
    "miley cyrus::midnight sky": 223,
    "sabrina carpenter::espresso": 175,
    "sabrina carpenter::please please please": 186,
    "sabrina carpenter::feather": 186,
    "lil nas x feat. billy ray cyrus::old town road (remix)": 157,
    "the kid laroi & justin bieber::stay": 141,
    "teddy swims::lose control": 211,
    "hozier::take me to church": 242,
    "hozier::too sweet": 246,                       # 4:06 (file 251 = 4:11 ok)
    "lewis capaldi::someone you loved": 182,
    "lewis capaldi::before you go": 215,
    "lewis capaldi::someone you loved": 182,
    "post malone feat. 21 savage::rockstar": 218,
    "post malone::circles": 215,

    # ====== 50S-60S ROCK & SOUL ======
    "chuck berry::johnny b. goode": 161,
    "chuck berry::maybellene": 142,
    "buddy holly::peggy sue": 151,
    "buddy holly::that'll be the day": 154,
    "bill haley & his comets::rock around the clock": 150,  # 2:30 standard (file 2:50 - alternate or extended, mild FLAG)
    "bill haley & his comets::shake, rattle and roll": 180,
    "jerry lee lewis::great balls of fire": 110,    # original 1:50 (file 2:35 — likely longer/alternate version or live, FLAG)
    "jerry lee lewis::whole lotta shakin' goin' on": 172,
    "elvis presley::heartbreak hotel": 128,
    "elvis presley::hound dog": 136,
    "elvis presley::can't help falling in love": 181,
    "elvis presley::don't be cruel": 122,
    "elvis presley::blue suede shoes": 121,
    "elvis presley::it's now or never": 195,
    "ritchie valens::la bamba": 124,                # original 2:04 (file 2:54 — likely Los Lobos cover misattributed, FLAG)
    "dion::runaround sue": 172,
    "the everly brothers::wake up little susie": 124,
    "the everly brothers::let it be me": 159,
    "the four seasons::sherry": 159,                # 2:33 ish (file matches close)
    "the penguins::earth angel": 180,
    "the five satins::in the still of the night": 183,
    "the shirelles::will you love me tomorrow": 158,
    "the ronettes::be my baby": 160,
    "ben e. king::stand by me": 181,
    "the dixie cups::chapel of love": 171,
    "the supremes::stop! in the name of love": 171,
    "the supremes::baby love": 158,
    "the supremes::you can't hurry love": 175,
    "the supremes::come see about me": 161,
    "the temptations::my girl": 165,
    "the temptations::get ready": 162,
    "the temptations::papa was a rollin' stone": 418,  # album 11:45 LP. file 418 = 6:58 single edit
    "four tops::reach out i'll be there": 183,
    "four tops::i can't help myself (sugar pie, honey bunch)": 161,
    "the jackson 5::abc": 177,                      # 2:57 standard (file 2:20 short - FLAG)
    "the jackson 5::i want you back": 178,
    "the jackson 5::i'll be there": 240,
    "the jackson 5::never can say goodbye": 180,
    "the jackson 5::dancing machine": 157,
    "marvin gaye::i heard it through the grapevine": 193,
    "marvin gaye::what's going on": 233,
    "marvin gaye::let's get it on": 293,
    "marvin gaye & tammi terrell::ain't no mountain high enough": 148,
    "aretha franklin::respect": 147,
    "aretha franklin::chain of fools": 166,
    "aretha franklin::think": 138,
    "aretha franklin::i say a little prayer": 214,
    "aretha franklin::(you make me feel like) a natural woman": 163,
    "etta james::at last": 180,
    "etta james::i'd rather go blind": 157,
    "otis redding::(sittin' on) the dock of the bay": 164,
    "the rolling stones::(i can't get no) satisfaction": 224,
    "the kinks::you really got me": 134,
    "the mamas & the papas::california dreamin'": 161,
    "the mamas & the papas::dream a little dream of me": 221,  # 3:41 standard.
    "the beach boys::california girls": 167,
    "the beach boys::wouldn't it be nice": 154,
    "the beach boys::in my room": 134,
    "sonny & cher::i got you babe": 191,
    "sonny & cher::the beat goes on": 208,
    "james brown::i got you (i feel good)": 168,
    "ray charles::hit the road jack": 119,
    "louis armstrong::what a wonderful world": 137,
    "louis armstrong::hello, dolly!": 145,
    "frank sinatra::my way": 273,
    "frank sinatra::fly me to the moon": 147,
    "frank sinatra::theme from new york, new york": 205,
    "frank sinatra::the lady is a tramp": 196,
    "frank sinatra::i've got you under my skin": 224,
    "dean martin::that's amore": 191,
    "dean martin::sway": 162,
    "dean martin::everybody loves somebody": 167,
    "bobby darin::beyond the sea": 178,
    "bobby darin::mack the knife": 188,
    "bobby darin::splish splash": 132,
    "judy garland::over the rainbow": 165,
    "audrey hepburn::moon river": 163,
    "patsy cline": None,
    "sam cooke::wonderful world": 131,
    "tom jones::it's not unusual": 121,
    "tom jones::she's a lady": 174,
    "the guess who::american woman": 308,           # album 5:08 (file matches)
    "blue öyster cult::(don't fear) the reaper": 308,  # album 5:08
    "thin lizzy::the boys are back in town": 274,
    "neil diamond": None,
    "creedence clearwater revival::fortunate son": 140,
    "martha and the vandellas::dancing in the street": 166,
    "the verve::bitter sweet symphony": 357,
    "sam the sham and the pharaohs::wooly bully": 144,
    "the wellingtons::the ballad of gilligan's isle": 71,  # TV theme

    # ====== 70S/80S CONTINUED ======
    "queen::don't stop me now": 212,
    "queen::i want to break free": 258,
    "queen::radio ga ga": 348,
    "queen::fat bottomed girls": 257,
    "queen & david bowie::under pressure": 248,
    "elton john::tiny dancer": 377,
    "elton john::rocket man (i think it's going to be a long, long time)": 281,
    "elton john::bennie and the jets": 322,
    "elton john::your song": 241,
    "elton john::i'm still standing": 184,
    "elton john::candle in the wind": 230,
    "elton john::goodbye yellow brick road": 193,
    "elton john::nikita": 257,
    "elton john::sad songs (say so much)": 295,
    "elton john::saturday night's alright (for fighting)": 295,
    "elton john::can you feel the love tonight": 242,
    "elton john & dua lipa::cold heart (pnau remix)": 203,    # radio 3:23 (file 4:16 = extended version, FLAG)
    "elton john::circle of life": 292,
    "billy joel::piano man": 339,                   # 5:39 album (file 2:45 — way too short, FLAG)
    "billy joel::we didn't start the fire": 289,
    "billy joel::uptown girl": 197,
    "billy joel::tell her about it": 232,
    "billy joel::the longest time": 218,
    "billy joel::it's still rock and roll to me": 177,
    "billy joel::pressure": 295,                    # 4:55 album (file 2:24 — way too short, FLAG)
    "lionel richie::all night long (all night)": 259,
    "lionel richie::dancing on the ceiling": 262,
    "lionel richie::say you, say me": 241,
    "lionel richie::running with the night": 371,
    "commodores::easy": 256,
    "commodores::three times a lady": 220,          # 3:40 single. File 137 = 2:17 still way short - FLAG.
    "commodores::brick house": 208,
    "stevie wonder::superstition": 266,             # 4:26 album standard.
    "stevie wonder::sir duke": 234,
    "diana ross::i'm coming out": 322,
    "kool & the gang": None,
    "rod stewart": None,
    "bryan adams::summer of '69": 217,
    "bryan adams::run to you": 232,
    "bryan adams::cuts like a knife": 323,
    "bonnie tyler::total eclipse of the heart": 270,
    "bonnie tyler::holding out for a hero": 348,
    "kenny loggins::footloose": 220,
    "kenny loggins::danger zone": 215,
    "kenny loggins::i'm alright": 227,
    "john travolta & olivia newton-john::summer nights": 215,
    "john travolta & olivia newton-john::you're the one that i want": 167,
    "olivia newton-john::physical": 217,            # 3:37 album
    "olivia newton-john::hopelessly devoted to you": 184,
    "irene cara::fame": 246,
    "irene cara::flashdance... what a feeling": 246,
    "berlin::take my breath away": 257,
    "deniece williams::let's hear it for the boy": 257,  # 4:17 (file 260 OK)
    "eric carmen::hungry eyes": 252,
    "patrick swayze": None,
    "bill medley & jennifer warnes::(i've had) the time of my life": 287,
    "ray parker jr.::ghostbusters": 245,
    "kim carnes": None,
    "rick springfield::jessie's girl": 194,
    "rick springfield::affair of the heart": 269,
    "van halen::jump": 240,
    "van halen::panama": 213,
    "van halen::hot for teacher": 283,
    "kiss::rock and roll all nite": 175,           # 2:55 single (file 175 matches)
    "kiss::i was made for lovin' you": 270,        # 4:30 single (file 270 matches album/short)
    "def leppard::pour some sugar on me": 274,
    "def leppard::love bites": 346,
    "def leppard::rock of ages": 248,
    "poison::every rose has its thorn": 259,
    "poison::talk dirty to me": 224,
    "poison::nothin' but a good time": 224,
    "whitesnake::here i go again": 276,
    "whitesnake::is this love": 283,
    "twisted sister": None,
    "joan jett::bad reputation": 169,
    "joan jett & the blackhearts::i love rock 'n' roll": 177,
    "aerosmith::dream on": 268,
    "aerosmith::sweet emotion": 274,
    "boston::more than a feeling": 280,
    "boston::foreplay/long time": 467,
    "styx::come sail away": 367,
    "the steve miller band": None,
    "steve miller band::the joker": 256,
    "reo speedwagon::can't fight this feeling": 294,
    "reo speedwagon::keep on loving you": 201,
    "reo speedwagon::take it on the run": 240,
    "bob seger::old time rock & roll": 188,         # 3:08 standard.
    "bob seger::hollywood nights": 308,
    "bob seger::like a rock": 357,
    "rolling stones": None,
    "the temptations": None,
    "neil young": None,
    "creedence clearwater revival": None,
    "the police": None,
    "u2::beautiful day": 248,
    "u2::one": 276,
    "u2::vertigo": 198,
    "u2::elevation": 230,
    "u2::where the streets have no name": 337,
    "r.e.m.::losing my religion": 268,
    "r.e.m.::everybody hurts": 320,
    "r.e.m.::it's the end of the world as we know it (and i feel fine)": 247,
    "r.e.m.::man on the moon": 313,
    "r.e.m.::shiny happy people": 226,
    "the b-52's": None,
    "inxs::devil inside": 311,
    "inxs::need you tonight": None,
    "creed::higher": 317,
    "nickelback::photograph": 259,
    "nickelback::animals": 184,                     # 3:04 album (file 5:04 = much longer, WRONG version)
    "alanis morissette::ironic": 230,
    "natasha bedingfield::unwritten": 259,
    "bryan adams::summer of '69": 217,
    "madonna::like a prayer": 339,
    "madonna::like a virgin": 218,
    "madonna::material girl": 240,
    "madonna::papa don't preach": 269,
    "madonna::holiday": 370,                        # 12-inch 6:11 (file matches)
    "madonna::into the groove": 284,
    "madonna::open your heart": 254,
    "madonna::la isla bonita": 245,
    "madonna::crazy for you": 234,
    "madonna::alejandro": None,
    "madonna::where's the party": 263,
    "cher::believe": 239,
    "cher::if i could turn back time": 240,
    "cher::strong enough": 224,
    "tina turner::what's love got to do with it": 230,
    "tina turner::private dancer": 244,             # 4:04 single edit is the radio version. File 242 close.

    # ======= COUNTRY / OTHER ======
    "garth brooks::friends in low places": 260,
    "dolly parton::9 to 5": 165,
    "shania twain::man! i feel like a woman!": 234,
    "shania twain::you're still the one": 213,
    "willie nelson::always on my mind": 213,        # 3:33 standard (file 3:57 longer - FLAG, possibly alt version)
    "carrie underwood::before he cheats": 200,
    "kenny rogers::lucille": 220,                   # 3:40 standard (file 2:25 way too short - FLAG)

    # ======= DISNEY / MUSICAL THEATRE / SOUNDTRACKS ======
    "peabo bryson & regina belle::a whole new world": 161,
    "samuel e. wright::under the sea": 194,
    "carmen twillie & lebo m.::circle of life": 247,
    "nathan lane & ernie sabella::hakuna matata": 212,
    "jerry orbach::be our guest": 224,              # 3:44 standard. File 3:30 close.
    "jodi benson::part of your world": 194,
    "vanessa williams::colors of the wind": 258,
    "idina menzel::let it go": 225,
    "ryan gosling::i'm just ken": 223,
    "phil collins::you'll be in my heart": 258,

    # ======= TV / FILM THEMES (intentionally short or thematic) ======
    "neal hefti::batman theme": 44,
    "jonathan wolff::seinfeld theme": 51,
    "vic mizzy::the addams family theme": 52,
    "alexander courage::star trek theme": 55,
    "merv griffin::jeopardy! theme (think)": 64,
    "patrick pinney & cast::spongebob squarepants theme song": 66,
    "edd kalehoff::the price is right theme": 67,
    "chuck lorre::teenage mutant ninja turtles theme": 67,
    "richard strauss::also sprach zarathustra (2001: a space odyssey theme)": 79,
    "kyle dixon & michael stein::stranger things theme": 79,
    "gabriel mann::modern family main theme": 83,
    "dan marocco::brooklyn nine-nine theme": 86,
    "the wellingtons::the ballad of gilligan's isle": 94,
    "danny elfman::the simpsons theme": 101,
    "ramin djawadi::game of thrones main title": 102,
    "nicholas britell::succession main title theme": 102,
    "lalo schifrin::mission: impossible theme": 152,
    "monty norman::james bond theme": 122,
    "mike oldfield::tubular bells (the exorcist theme)": 202,
    "john williams::star wars main theme": 347,
    "john williams::jurassic park theme": 208,
    "john williams::e.t. theme (flying)": 225,
    "john williams::raiders march (indiana jones theme)": 310,
    "bill conti::gonna fly now (theme from rocky)": 168,
    "johnny mandel::suicide is painless (theme from m*a*s*h)": 172,
    "vangelis::chariots of fire": 213,
    "gary portnoy::where everybody knows your name": 151,  # Cheers theme - short version
    "the solids::hey beautiful (how i met your mother theme)": 224,  # 3:43
    "mark mueller::ducktales theme": 130,
    "merv griffin::wheel of fortune theme": 115,
    "frank de vol::the brady bunch theme": 179,
    "barenaked ladies::the big bang theory theme (history of everything)": 105,
    "john e. davis::beverly hills 90210 theme": 188,
    "john e. davis::beverly hills 90210 theme (alt mix)": 200,
    "saved by the bell cast::saved by hell": 218,    # uncertain, file len OK
    "nine inch nails::hurt": 374,
    "johnny cash::hurt": None,
}


def normalize(s):
    return s.lower().strip()


def lookup_canonical(artist, title):
    key = f"{normalize(artist)}::{normalize(title)}"
    val = CANONICAL.get(key)
    if val is None:
        return None
    return float(val)


def main():
    with open(TRACKS_DIR / "songs.json") as f:
        data = json.load(f)

    rows = []
    flagged_count = 0
    for s in data["songs"]:
        title = s["title"]
        artist = s["artist"]
        difficulty = s["difficulty"]
        file_path = s["file"]
        actual = s["duration"]
        snippet = s.get("snippet", False)

        if snippet:
            rows.append({
                "title": title,
                "artist": artist,
                "difficulty": difficulty,
                "file": file_path,
                "actual_seconds": round(actual, 2),
                "canonical_seconds": round(actual, 2),
                "delta_seconds": 0.0,
                "flagged": "FALSE",
                "notes": "30s Spotify preview snippet — intentional",
            })
            continue

        canonical = lookup_canonical(artist, title)
        notes = ""
        if canonical is None:
            # Unknown — trust the file
            canonical = actual
            notes = "no canonical lookup; assumed correct"

        delta = actual - canonical
        abs_delta = abs(delta)
        pct = abs_delta / canonical if canonical > 0 else 0
        flagged = (abs_delta > 10 and pct > 0.05)

        if flagged:
            flagged_count += 1
            if delta > 0:
                notes = f"actual {actual:.1f}s LONGER than canonical {canonical:.0f}s (likely extended/remix/album)"
            else:
                notes = f"actual {actual:.1f}s SHORTER than canonical {canonical:.0f}s (likely radio edit/clip/snippet)"

        rows.append({
            "title": title,
            "artist": artist,
            "difficulty": difficulty,
            "file": file_path,
            "actual_seconds": round(actual, 2),
            "canonical_seconds": round(canonical, 2),
            "delta_seconds": round(delta, 2),
            "flagged": "TRUE" if flagged else "FALSE",
            "notes": notes,
        })

    # Write CSV
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "title", "artist", "difficulty", "file",
            "actual_seconds", "canonical_seconds", "delta_seconds",
            "flagged", "notes",
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nTotal songs: {len(rows)}")
    print(f"Flagged: {flagged_count}")

    print("\nTop 30 mismatches by absolute delta:")
    mismatches = sorted(
        [r for r in rows if r["flagged"] == "TRUE"],
        key=lambda r: abs(r["delta_seconds"]),
        reverse=True,
    )
    for r in mismatches[:30]:
        print(f"  {r['delta_seconds']:+8.1f}s  {r['artist']} - {r['title']}  ({r['notes']})")


if __name__ == "__main__":
    main()
