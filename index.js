#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')
const util = require('util')
const { createProxyServer } = require('@mutagen-d/node-proxy-server');
const { Client } = require('ssh2')
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .usage(`ssh-proxy [-D [<bind-address>:]<port>] [-h <ssh-host>] [-p <ssh-port>] [-u <ssh-user>] [-P <ssh-password>] [-k <keep-alive-interval>] [--verbose] [-identity <ssh-priv-key-file-path>] [[<ssh-user>@]<ssh-host>]`)
  .options('dynamic', {
    alias: 'D',
    type: 'string',
    desc: 'Proxy server [bind_address:]port',
    default: '8080',
  })
  .options('host', {
    alias: 'h',
    type: 'string',
    desc: 'SSH server host',
  })
  .options('port', {
    alias: 'p',
    type: 'number',
    desc: 'SSH server port',
    default: 22,
  })
  .options('user', {
    alias: 'u',
    type: 'string',
    desc: 'SSH user',
  })
  .options('password', {
    alias: 'P',
    type: 'string',
    desc: 'SSH password'
  })
  .options('identity', {
    alias: 'i',
    type: 'string',
    desc: 'SSH identity (private key) file',
  })
  .options('keepalive', {
    alias: 'k',
    type: 'number',
    desc: 'keep alive interval, seconds',
    default: 0,
  })
  .options('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  })
  .parse()

/**
 * @template T
 * @param {Extract<T, (...args: any[]) => any>} fn 
 * @returns {T}
 */
const onVerbose = (fn) => {
  return (...args) => {
    if (argv.verbose) {
      return fn(...args)
    }
  }
}
/**
 * @template T
 * @param {Extract<T, (...args: any[]) => any>} fn 
 * @returns {T}
 */
const verbose = (fn, ...args) => {
  if (argv.verbose) {
    fn(...args)
  }
}

const ssh = { client: new Client(), options: {} }
{
  let { user, host } = argv;
  if (argv._[0]) {
    const destination = argv._[0].split('@');
    host = host || destination.pop();
    user = user || destination.pop();
  }
  ssh.options = {
    username: user,
    password: argv.password,
    port: argv.port,
    host: host,
    privateKey: argv.password ? undefined : argv.identity ? fs.readFileSync(argv.identity) : fs.readFileSync(path.join(os.homedir(), './.ssh/id_rsa')),
    keepaliveInterval: 0,
  }
}
verbose(() => {
  console.log('options', {
    dynamic: argv.dynamic,
    host: ssh.options.host,
    port: ssh.options.port,
    user: ssh.options.username,
    password: ssh.options.password ? '*'.repeat(ssh.options.password.length) : undefined,
    identity: argv.identity,
    keepalive: argv.keepalive,
  })
})

const forwardOut = util.promisify(ssh.client.forwardOut)
const server = createProxyServer({
  createProxyConnection: (info) => {
    return forwardOut.call(ssh.client, info.srcHost, info.srcPort, info.dstHost, info.dstPort);
  },
})

verbose(() => {
  server.on('connection', (socket) => {
    const { remoteAddress: host, remotePort: port } = socket;
    console.log('connected from', `${host}:${port}`)
    socket.on('close', () => console.log('disconnected', `${host}:${port}`))
  })
})

if (argv.keepalive) {
  server.on('connection', (socket) => {
    socket.setTimeout(argv.keepalive * 1000, () => socket.destroy())
  })
}

server.on('error', (error) => console.error(error))

ssh.client.connect(ssh.options)
ssh.client.on('end', () => {
  verbose(() => console.log('ssh client disconnected'))
  if (server.listening) {
    verbose(() => console.log('ssh client reconnecting'))
    ssh.client.connect(ssh.options)
  }
})

ssh.client.on('ready', () => {
  verbose(() => console.log('ssh client ready'))
  const dynamic = argv.dynamic.split(':');
  const port = dynamic.pop();
  const hostname = dynamic.pop() || '0.0.0.0';
  server.listen(port, hostname, onVerbose(() => console.log('server listening on port', port)))
})
ssh.client.on('error', (error) => console.error(error))

server.on('close', onVerbose(() => console.log('server closed')))