curl.exe : * Host localhost:4000 was 
resolved.
At line:1 char:1
+ curl.exe -v "http://localhost:4000/ap
i/v1/mentorship/senior-sessions/ ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpeci 
   fied: (* Host localhost:4000 was r  
  esolved.:String) [], RemoteExcepti   
 on
    + FullyQualifiedErrorId : NativeCo 
   mmandError
 
* IPv6: ::1
* IPv4: 127.0.0.1
*   Trying [::1]:4000...
* Established connection to localhost 
(::1 port 4000) from ::1 port 65277 
  % Total    % Received % Xferd  
Average Speed  Time    Time    Time   
Current
                                 Dload 
 Upload  Total   Spent   Left   Speed

  0      0   0      0   0      0      
0      0                              
0* using HTTP/1.x
> GET /api/v1/mentorship/senior-session
s/cc4411a2-d1cc-4a12-9c70-621553948744 
HTTP/1.1

> Host: localhost:4000

> User-Agent: curl/8.21.0

> Accept: */*

> 

* Request completely sent off
< HTTP/1.1 401 Unauthorized

< Vary: Origin, Accept-Encoding

< Access-Control-Allow-Credentials: 
true

< Access-Control-Expose-Headers: Author
ization,Content-Length,X-CSRF-Token

< Content-Security-Policy: default-src 
'self';base-uri 'self';font-src 'self' 
https: data:;form-action 
'self';frame-ancestors 'self';img-src 
'self' data:;object-src 
'none';script-src 
'self';script-src-attr 
'none';style-src 'self' https: 'unsafe-
inline';upgrade-insecure-requests

< Cross-Origin-Opener-Policy: 
same-origin

< Cross-Origin-Resource-Policy: 
same-origin

< Origin-Agent-Cluster: ?1

< Referrer-Policy: 
strict-origin-when-cross-origin

< Strict-Transport-Security: 
max-age=31536000; includeSubDomains

< X-Content-Type-Options: nosniff

< X-DNS-Prefetch-Control: off

< X-Download-Options: noopen

< X-Frame-Options: DENY

< X-Permitted-Cross-Domain-Policies: 
none

< X-XSS-Protection: 1; mode=block

< RateLimit-Policy: 1000;w=900

< RateLimit-Limit: 1000

< RateLimit-Remaining: 970

< RateLimit-Reset: 296

< API-Version: v1

< Content-Type: application/json; 
charset=utf-8

< Content-Length: 116

< ETag: 
W/"74-eNzDkWL1EmZxUYEMikOJqWE2M84"

< Date: Thu, 01 Oct 2026 05:31:04 GMT

< Connection: keep-alive

< Keep-Alive: timeout=5

< 

{ [116 bytes data]

100    116 100    116   0      0  
12200      0                           
   0
100    116 100    116   0      0  
12046      0                           
   0
100    116 100    116   0      0  
11859      0                           
   0
* Connection #0 to host localhost:4000 
left intact
{"status":"error","statusCode":401,"message":"Authorization header required","timestamp":"2026-10-01T05:31:04.897Z"}