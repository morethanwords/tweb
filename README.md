### 服务端
```
apiVersion: v1
kind: ConfigMap
metadata:
  name: tg-proxy-nginx-conf
  namespace: default
data:
  default.conf: |
    log_format wsdebug '$remote_addr "$request" status=$status '
                       'upstream_status=$upstream_status '
                       'host=$host upstream=$tg_host '
                       'upgrade=$http_upgrade '
                       'ws_proto=$http_sec_websocket_protocol '
                       'uri=$uri args=$args';

    map $http_upgrade $connection_upgrade {
      default upgrade;
      '' close;
    }

    server {
      listen 80;
      resolver 192.168.4.1 valid=300s ipv6=off;

      access_log /var/log/nginx/access.log wsdebug;

      proxy_http_version 1.1;
      proxy_ssl_server_name on;

      proxy_connect_timeout 10s;
      proxy_send_timeout 3600s;
      proxy_read_timeout 3600s;

      proxy_buffering off;
      proxy_request_buffering off;

      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      location /healthz {
        return 200 "ok\n";
      }

      location ~ ^/(pluto|venus|aurora|vesta|flora|pluto-1|venus-1|aurora-1|vesta-1|flora-1)/(.*)$ {
        set $tg_host $1.web.telegram.org;
        set $tg_path $2;

        proxy_ssl_name $tg_host;

        proxy_set_header Host $tg_host;
        proxy_set_header Origin https://web.telegram.org;
        proxy_set_header Referer https://web.telegram.org/k/;
        proxy_set_header User-Agent "Mozilla/5.0";

        proxy_pass https://$tg_host/$tg_path$is_args$args;
      }

      location ~ ^/(kws1|kws2|kws3|kws4|kws5|kws1-1|kws2-1|kws3-1|kws4-1|kws5-1)/(apiws|apiws_premium)$ {
        set $tg_host $1.web.telegram.org;
        set $tg_path $2;

        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_name $tg_host;

        proxy_set_header Host $tg_host;
        proxy_set_header Origin https://web.telegram.org;
        proxy_set_header Referer https://web.telegram.org/k/;
        proxy_set_header User-Agent "Mozilla/5.0";

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Sec-WebSocket-Protocol $http_sec_websocket_protocol;
        proxy_set_header Sec-WebSocket-Key $http_sec_websocket_key;
        proxy_set_header Sec-WebSocket-Version $http_sec_websocket_version;
        proxy_set_header Sec-WebSocket-Extensions $http_sec_websocket_extensions;

        proxy_pass https://$tg_host/$tg_path;
      }

      location / {
        return 404;
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tg-reverse-proxy
  namespace: default
  labels:
    app: tg-reverse-proxy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: tg-reverse-proxy
  template:
    metadata:
      labels:
        app: tg-reverse-proxy
    spec:
      nodeSelector:
        node-id: master01
      containers:
        - name: nginx
          image: nginx:1.27-alpine
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
              name: http
          volumeMounts:
            - name: nginx-conf
              mountPath: /etc/nginx/conf.d/default.conf
              subPath: default.conf
          readinessProbe:
            httpGet:
              path: /healthz
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /healthz
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 20
      volumes:
        - name: nginx-conf
          configMap:
            name: tg-proxy-nginx-conf
---
apiVersion: v1
kind: Service
metadata:
  name: tg-reverse-proxy-service
  namespace: default
spec:
  selector:
    app: tg-reverse-proxy
  ports:
    - name: http
      port: 80
      targetPort: 80
      nodePort: 30303
      protocol: TCP
  type: NodePort
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tg-reverse-proxy-ingress
  namespace: default
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - api.888888.org
      secretName: api-888888-org-tls
  rules:
    - host: api.888888.org
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: tg-reverse-proxy-service
                port:
                  number: 80
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-888888-org-cert
  namespace: default
spec:
  secretName: api-888888-org-tls
  dnsNames:
    - api.888888.org
  issuerRef:
    name: selfsigned-issuer
    kind: ClusterIssuer
```
