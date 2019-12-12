#!/usr/bin/env python
from livereload import Server, shell

server = Server(wsgi_app)

# run a shell command
server.watch('site', 'pug site')

# run a function
def alert():
    print('foo')
server.watch('foo.txt', alert)

# output stdout into a file
server.watch('style.less', shell('lessc style.less', output='style.css'))

server.serve()
