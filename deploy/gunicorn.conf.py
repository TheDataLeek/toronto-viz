workers = 1
forwarded_allow_ips = "*"  # trust X-Forwarded-For from Tailscale relay
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:5000"
accesslog = "-"  # stdout → journald
