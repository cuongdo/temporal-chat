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
  'rjnn',
  'umanwizard',
  'antifuchs',
]

// main content
class TemporalChat extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      imageId: null,
      image: null,
      error: null,
    };
  }

  pollForPhotos() {
    fetch('http://localhost:3001/next_photo')
      .then(response => response.json())
      .then(data => {
        console.log('polled for new photo')
        const uploadedAt = timeSince(data.insert_ts)

        console.log(data.id)
        console.log(this.imageId)
        console.log(data)
        if (data.id && data.id === this.state.imageId) {
          return
        }

        const uploader = uploaders[Math.floor(Math.random() * uploaders.length)]
        this.setState({
          imageId: data.id,
          image: data.photo,
          comment: data.comment,
          uploadedAt,
          uploader,
          error: null,
        })
      })
      .catch(error => {
        console.error(error)
        this.setState({
          imageId: null,
          image: null,
          comment: null,
          uploadedAt: null,
          error: error,
        })
      })
  }

  componentDidMount() {
    this.timer = setInterval(() => this.pollForPhotos(), 500);
    //this.pollForPhotos()
  }

  componentWillUnmount() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  render() {
    if (!this.state.image) {
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
          <img src={"data:image/jpeg;base64,"+this.state.image} alt={this.state.comment} />
        </p>

        <div id="comments">
          <p id="caption">{this.state.comment}</p>
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
