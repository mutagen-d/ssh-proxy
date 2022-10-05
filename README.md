# ssh-proxy

Http and socks proxy over ssh tunnel

## Install

```bash
npm install -g ssh-proxy
```

## Usage

```bash
ssh-proxy -D 8080 user@example.com
```

See also

```bash
ssh-proxy --help
```

## Motivation

`ssh` dynamic port forwarding supports socks protocol, but not http one.
And some apps can use only http proxies.
That's why this package exists.  `ssh-proxy` supports both protocols: http and socks (v4 and v5)
