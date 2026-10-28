"""Wait for a marker on a child process pipe on both Windows and POSIX."""
from threading import Event, Thread


def wait_for_marker(process, marker, timeout, message):
    lines = []
    found = Event()

    def read_until_marker():
        for line in process.stdout:
            value = line.strip()
            if value == marker:
                found.set()
                return
            lines.append(value)

    reader = Thread(target=read_until_marker, daemon=True)
    reader.start()
    if not found.wait(timeout):
        raise AssertionError(message)
    reader.join(timeout=1)
    return lines
