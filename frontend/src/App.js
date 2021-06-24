import "@blueprintjs/core/lib/css/blueprint.css";
import './App.css';
import logo from './logo.svg';
import React from 'react';
import {
  Alignment,
  Classes,
  Navbar,
  NavbarDivider,
  NavbarGroup,
  NavbarHeading,
  ProgressBar,
} from "@blueprintjs/core";

// human-readable elapsed time since date
// https://stackoverflow.com/questions/3177836/how-to-format-time-since-xxx-e-g-4-minutes-ago-similar-to-stack-exchange-site
function timeSince(date) {
  var seconds = Math.floor((new Date() - date) / 1000);
  var interval = seconds / 31536000;

  if (interval > 1) {
    return Math.floor(interval) + " years";
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return Math.floor(interval) + " months";
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return Math.floor(interval) + " days";
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return Math.floor(interval) + " hours";
  }
  interval = seconds / 60;
  if (interval > 1) {
    return Math.floor(interval) + " minutes";
  }
  return Math.floor(seconds) + " seconds";
}

// nav bar
const Navigation = () => {
  return (
    <Navbar className={Classes.DARK}>
      <NavbarGroup align={Alignment.LEFT}>
        <NavbarHeading id="app-name">Temporal Chat</NavbarHeading>
        <NavbarDivider />
        <NavbarHeading>The leading temporal social network for streaming database nerds.</NavbarHeading>
      </NavbarGroup>
    </Navbar>
  );
}

const uploaders = [
  'mcsherry133t',
  'ChiefDoOfficer',
  'Jessica_BarrysBootcamp',
  'rjnn-alt',
  'umanwizard',
  'antifuchs',
  'uce',
]

// main content
class TemporalChat extends React.Component {
  constructor(props) {
    super(props);
    this.state = { }
  }

  pollForPhotos() {
    // TODO: use TAIL if there's time
    fetch('http://localhost:3001/next_photo')
      .then(response => response.json())
      .then(image => {
        const uploadedAt = timeSince(image.insert_ts)

        const oldImageId = this.state.image ? this.state.image.id : null
        const newImageId = image ? image.id : null
        if (oldImageId === newImageId) {
          return
        }
        console.log('image changed', image)

        const uploader = uploaders[Math.floor(Math.random() * uploaders.length)]
        this.setState({
          image,
          uploadedAt,
          uploader,
          refreshedAt: Date.now(),
          error: null,
          progress: 1.0,
        })
      })
      .catch(error => {
        console.error(error)
        this.setState({
          image: null,
          error: error.toString(),
        })
      })
  }

  updateProgress() {
    if (this.state.image) {
      const total = this.state.image.delete_ts - this.state.refreshedAt
      const timeLeft = this.state.image.delete_ts - Date.now()
      const progress = timeLeft / total
      this.setState({
        ...this.state,
        progress,
      })
    }
  }

  componentDidMount() {
    this.timer = setInterval(() => this.pollForPhotos(), 500);
    this.progressTimer = setInterval(() => this.updateProgress(), 100);
  }

  componentWillUnmount() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  render() {
    if (!this.state.image || !this.state.image.photo) {
      return (
        <div id="main">
          <img src={logo} className="App-logo" alt="logo" />
          <p id="waiting">waiting for more photos...</p>
          <p id="error">{this.state.error ? this.state.error : ""}</p>
        </div>
      )
    }

    return (
      <div id="main">
        <p>
          <img src={"data:image/jpeg;base64,"+this.state.image.photo} alt={this.state.image.comment} />
          <ProgressBar value={this.state.progress} />
        </p>

        <div id="comments">
          <p id="caption">{this.state.image.comment}</p>
          <p>Uploaded by <strong>{this.state.uploader}</strong> {this.state.uploadedAt} ago</p>

          <h2>Comments</h2>
          <div className="bp3-input-group .modifier">
          <input type="text" className="bp3-input" placeholder="Enter your professional, intellectually consistent comment..." />
          <button className="bp3-button bp3-minimal bp3-intent-primary bp3-icon-arrow-right"></button>
          </div>
        </div>
      </div>
    )
  }
}

const Footer = () => {
  return (
    <div id="footer">
        Powered by <img src="https://materialize.com/wp-content/uploads/2020/02/materialize_logo_primary-1.png" alt="Materialize" width="100px" />
    </div>
  )
}

function App() {
  return (
    <div className="App">
      <Navigation />
      <TemporalChat />
      <Footer />
    </div>
  );
}

export default App;
