# How the Spotify card works

  

mrrp :3

  

## the problem

my site is static. Github pages just hand out files and don't run anything. so it cant ask Spotify what i'm listening to, and definitely can't be trusted with a client secret. the card on the page therefore doesn't talk to Spotify at all!

  

something needs to be in the middle of both and remember the last thing it got told!

  

## shape

I used three pieces for this

DiscSpot, an app i made that runs on my mac. It knows what im playing, and pushes that to a worker roughly every second

Cloudflare worker, which keeps the last snapshot in a durable object. also counts page views because why deploy two when one will do yfm

the card! the card polls that worker and draws whatever it recieves

  

so, my app discspot pushes, the site pulls. neither even talk to spotify and ever hold a credential!

## why a durable object?  

a worker is stateless and gets thrown away constantly, so a plain variable would forget the song every few seconds. the durable object is a piece of storage that sticks around between the requests. one instance, two keys, thats basically the database, a view count and spotify snapshot

  

## why i had to make discspot

Discspot is what makes it not able to be copy pasteable right, and i want to be honest about that. thats mine lmfao. I wrote it, and without it theres no card. the site side is dumb on purpose, it never authenticates to spotify, never refreshes a token, and doesnt even know my account exists. it just reads a json blob from a url

  

if you wanted to try this yourself, youd need your own little publisher on your own machine, or.. theres probably a million better options

  

## token

the worker accepts writes on one endpoint, and that endpoint needs a bearer token. the token lives in a wrangler secret and in discspot, nowehere else. not in the repo, page, browser, etc.

  

without it, anyone could make my site claim im listening to something horrible. but with it, the publish path is mine alone, the read path is public which is fine. its a song title....

  

## why it polls not streams

a websocket would be more correct, so to say, but also have more movng parts.

I went with polling every 1.2 seconds, with a 3s timeout so a dead worker never hangs

  

if you ever seen a status widget updade every 1.2s, it looks janky as hell. which brings me to the actual clever bit..!

  

## the progress bar is fake.

the bar is not waiting for updates. every 250ms it takes the last known position, adds however long its been since that snapshot arrived, clamps it to the track duration, and redraws. the snapshot carries a timestamp, so even the delay between my mac publish and page load is accounted for.

  

## load bearing details

-   Spotify ids are 22 characters. I validate that before building a track link, otherwise "open in spotify" button goes to a 404.
-   covers have to be https. a http image on a https page silently doesnt render, so anything that isnt https is skipped rather than broken
-   positions lie. a paused track thats say there for an hour reports a position past the end, so its clamped
-   the cors allowlist is exact. my site original plus localhost, nothing else. changing the site url means editing the worker, otherwise the card quietly dies with a 403
-   a dead relay must not break the page. every failure is a status line, never an exception. worst case the card is ugly not the site

  

## small stuff

the x hides the card, and page remembers that. so it doesnt come back on every refresh. it animates out instead of a pop, since a pop looks like a bug. it can also be pinned to any corner, and stays while scrolling. i mainly keep it pinned bottom left tho!

the site refuses to put it in the same corner as the info box, because two floating boxes in one corner is cursed asf

  

## what id change

not much, ngl. if i were doing it for other people id want a websocket or server sent events so the update is instant instead of up to 1.2s late, and id want the publisher to be something anyone can run. as a personal site widget tho, this is exactly the amount of effort id give it!

  

## thats all :3

its a 40 line worker, a push from an app i made, and a timer on the page. the only part that took thought was making it look alive without it being alive..

  

  

# heres some images !

  

![image.png](./media/657947c2-adc8-48d2-b0d3-4bf144ac78b0.png)![image.png](./media/390c6aea-1787-4e6e-b878-541265c5751c.png)![image.png](./media/41b40ea6-5be2-4885-8a1c-4e64bc4818d5.png)ty to my wife @catl0verforever for keeping me sane during this project <3
